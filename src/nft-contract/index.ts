
import { assert,NearContract, NearBindgen, near, call, view, LookupMap, UnorderedMap, Vector, UnorderedSet } from 'near-sdk-js'
import { NFTContractMetadata, Token, TokenMetadata, internalNftMetadata, JsonToken } from './metadata';
// import { internalMint } from './mint';
// import { internalNftToken, internalNftTransfer, internalNftTransferCall, internalResolveTransfer } from './nft_core';
export declare type Bytes = string;
export declare function u8ArrayToBytes(array: Uint8Array): string;
export declare function bytesToU8Array(bytes: Bytes): Uint8Array;
export declare function bytes(strOrU8Array: string | Uint8Array): Bytes;
const GAS_FOR_RESOLVE_TRANSFER = 40_000_000_000_000;
const GAS_FOR_NFT_ON_TRANSFER = 35_000_000_000_000;
export declare type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

/// This spec can be treated like a version of the standard.
export const NFT_METADATA_SPEC = "nft-1.0.0";

/// This is the name of the NFT standard we're using
export const NFT_STANDARD_NAME = "nep171";

@NearBindgen
export class Contract extends NearContract {
    owner_id: string;
    tokensPerOwner: LookupMap;
    tokensById: LookupMap;
    tokenMetadataById: UnorderedMap;
    metadata: NFTContractMetadata;

    /*
        initialization function (can only be called once).
        this initializes the contract with metadata that was passed in and
        the owner_id. 
    */
    constructor({
        owner_id, 
        metadata = {
            spec: "nft-1.0.0",
            name: "NFTDawnContract",
            symbol: "NFT"
        } 
    }) {
        super()
        this.owner_id = owner_id;
        this.tokensPerOwner = new LookupMap("tokensPerOwner");
        this.tokensById = new LookupMap("tokensById");
        this.tokenMetadataById = new UnorderedMap("tokenMetadataById");
        this.metadata = metadata;
    }

    default() {
        return new Contract({owner_id: ''})
    }

    /*
        MINT
    */
    @call
    nft_mint({ token_id, metadata, receiver_id, perpetual_royalties }) {
        return this.internalMint({ contract: this, tokenId: token_id, metadata: metadata, receiverId: receiver_id, perpetualRoyalties: perpetual_royalties });
    }

    /*
        CORE
    */
    @view
    //get the information for a specific token ID
    nft_token({ token_id }) {
        return this.internalNftToken({ contract: this, tokenId: token_id });
    }

    @call
    //implementation of the nft_transfer method. This transfers the NFT from the current owner to the receiver. 
    nft_transfer({ receiver_id, token_id, approval_id, memo }) {
        return this.internalNftTransfer({ contract: this, receiverId: receiver_id, tokenId: token_id, approvalId: approval_id, memo: memo });
    }

    @call
    //implementation of the transfer call method. This will transfer the NFT and call a method on the receiver_id contract
    nft_transfer_call({ receiver_id, token_id, approval_id, memo, msg }) {
        return this.internalNftTransferCall({ contract: this, receiverId: receiver_id, tokenId: token_id, approvalId: approval_id, memo: memo, msg: msg });
    }

    @call
    //resolves the cross contract call when calling nft_on_transfer in the nft_transfer_call method
    //returns true if the token was successfully transferred to the receiver_id
    nft_resolve_transfer({ authorized_id, owner_id, receiver_id, token_id, approved_account_ids, memo }) {
        return this.internalResolveTransfer({ contract: this, authorizedId: authorized_id, ownerId: owner_id, receiverId: receiver_id, tokenId: token_id, approvedAccountIds: approved_account_ids, memo: memo });
    }


    // ***** Helper functions *****//
    internalMint({
        contract,
        tokenId,
        metadata,
        receiverId,
        perpetualRoyalties
    }:{ 
        contract: Contract, 
        tokenId: string, 
        metadata: TokenMetadata, 
        receiverId: string 
        perpetualRoyalties: {[key: string]: number}
    }): void {
        //measure the initial storage being used on the contract TODO
        let initialStorageUsage = near.storageUsage();
    
        // create a royalty map to store in the token
        let royalty: { [accountId: string]: number } = {}
    
        // if perpetual royalties were passed into the function: TODO: add isUndefined fn
        if (perpetualRoyalties != null) {
            //make sure that the length of the perpetual royalties is below 7 since we won't have enough GAS to pay out that many people
            assert(Object.keys(perpetualRoyalties).length < 7, "Cannot add more than 6 perpetual royalty amounts");
            
            //iterate through the perpetual royalties and insert the account and amount in the royalty map
            Object.entries(perpetualRoyalties).forEach(([account, amount], index) => {
                royalty[account] = amount;
            });
        }
    
        //specify the token struct that contains the owner ID 
        let token = new Token ({
            //set the owner ID equal to the receiver ID passed into the function
            ownerId: receiverId,
            //we set the approved account IDs to the default value (an empty map)
            approvedAccountIds: {},
            //the next approval ID is set to 0
            nextApprovalId: 0,
            //the map of perpetual royalties for the token (The owner will get 100% - total perpetual royalties)
            royalty,
        });
    
        //insert the token ID and token struct and make sure that the token doesn't exist
        assert(!contract.tokensById.containsKey(tokenId), "Token already exists");
        contract.tokensById.set(tokenId, token)
    
        //insert the token ID and metadata
        contract.tokenMetadataById.set(tokenId, metadata);
    
        //call the internal method for adding the token to the owner
        this.internalAddTokenToOwner(contract, token.owner_id, tokenId)
    
        // Construct the mint log as per the events standard.
        let nftMintLog = {
            // Standard name ("nep171").
            standard: NFT_STANDARD_NAME,
            // Version of the standard ("nft-1.0.0").
            version: NFT_METADATA_SPEC,
            // The data related with the event stored in a vector.
            event: "nft_mint",
            data: [
                {
                    // Owner of the token.
                    owner_id: token.owner_id,
                    // Vector of token IDs that were minted.
                    token_ids: [tokenId],
                }
            ]
        }
        
        // Log the json.
        near.log(`EVENT_JSON:${JSON.stringify(nftMintLog)}`);
    }

    

    internalNftToken({
        contract,
        tokenId
    }:{ 
        contract: Contract, 
        tokenId: string 
    }) {
        let token = contract.tokensById.get(tokenId) as Token;
        //if there wasn't a token ID in the tokens_by_id collection, we return None
        if (token == null) {
            return null;
        }
    
        //if there is some token ID in the tokens_by_id collection
        //we'll get the metadata for that token
        let metadata = contract.tokenMetadataById.get(tokenId) as TokenMetadata;
        
        //we return the JsonToken
        let jsonToken = new JsonToken({
            tokenId: tokenId,
            ownerId: token.owner_id,
            metadata,
            approvedAccountIds: token.approved_account_ids,
            royalty: token.royalty
        });
        return jsonToken;
    }

    internalNftTransfer({
        contract,
        receiverId,
        tokenId,
        approvalId,
        memo,
    }:{
        contract: Contract, 
        receiverId: string, 
        tokenId: string, 
        approvalId: number
        memo: string
    }) {
    }

    internalNftTransferCall({
        contract,
        receiverId,
        tokenId,
        approvalId,
        memo,
        msg
    }:{
        contract: Contract,
        receiverId: string, 
        tokenId: string, 
        approvalId: number,
        memo: string,
        msg: string  
    }) {

        //get the sender to transfer the token from the sender to the receiver
        let senderId = near.predecessorAccountId();
    
        //call the internal transfer method and get back the previous token so we can refund the approved account IDs
        let previousToken = this.internalTransfer(
            contract,
            senderId,
            receiverId,
            tokenId,
            approvalId,
            memo,
        );
    
        // Initiating receiver's call and the callback
        const promise = near.promiseBatchCreate(receiverId);
        near.promiseBatchActionFunctionCall(
            promise, 
            "nft_on_transfer", 
            bytes(JSON.stringify({ 
                sender_id: senderId,
                previous_owner_id: previousToken.owner_id,
                token_id: tokenId,
                msg
            })), 
            0, // no deposit 
            GAS_FOR_NFT_ON_TRANSFER
        );
    
        // We then resolve the promise and call nft_resolve_transfer on our own contract
        near.promiseThen(
            promise, 
            near.currentAccountId(), 
            "nft_resolve_transfer", 
            bytes(JSON.stringify({
                owner_id: previousToken.owner_id,
                receiver_id: receiverId,
                token_id: tokenId,
                approved_account_ids: previousToken.approved_account_ids
            })), 
            0, // no deposit 
            GAS_FOR_RESOLVE_TRANSFER
        );
        return near.promiseReturn(promise);
    }


    internalTransfer(contract: Contract, senderId: string, receiverId: string, tokenId: string, approvalId: number, memo: string): Token {
        //get the token object by passing in the token_id
        let token = contract.tokensById.get(tokenId) as Token;
        if (token == null) {
            near.panic("no token found");
        }
    
        //if the sender doesn't equal the owner, we check if the sender is in the approval list
        if (senderId != token.owner_id) {
            //if the token's approved account IDs doesn't contain the sender, we panic
            if (!token.approved_account_ids.hasOwnProperty(senderId)) {
                near.panic("Unauthorized");
            }
    
            // If they included an approval_id, check if the sender's actual approval_id is the same as the one included
            if (approvalId != null) {
                //get the actual approval ID
                let actualApprovalId = token.approved_account_ids[senderId];
                //if the sender isn't in the map, we panic
                if (actualApprovalId == null) {
                    near.panic("Sender is not approved account");
                }
    
                //make sure that the actual approval ID is the same as the one provided
                assert(actualApprovalId == approvalId, `The actual approval_id ${actualApprovalId} is different from the given approval_id ${approvalId}`);
            }
        }
    
        //we make sure that the sender isn't sending the token to themselves
        assert(token.owner_id != receiverId, "The token owner and the receiver should be different")
    
        //we remove the token from it's current owner's set
        this.internalRemoveTokenFromOwner(contract, token.owner_id, tokenId);
        //we then add the token to the receiver_id's set
        this.internalAddTokenToOwner(contract, receiverId, tokenId);
    
        //we create a new token struct 
        let newToken = new Token ({
            ownerId: receiverId,
            //reset the approval account IDs
            approvedAccountIds: {},
            nextApprovalId: token.next_approval_id,
            //we copy over the royalties from the previous token
            royalty: token.royalty,
        });
    
        //insert that new token into the tokens_by_id, replacing the old entry 
        contract.tokensById.set(tokenId, newToken);
    
        //if there was some memo attached, we log it. 
        if (memo != null) {
            near.log(`Memo: ${memo}`);
        }
    
        // Default the authorized ID to be None for the logs.
        let authorizedId;
    
        //if the approval ID was provided, set the authorized ID equal to the sender
        if (approvalId != null) {
            authorizedId = senderId
        }
    
        // Construct the transfer log as per the events standard.
        let nftTransferLog = {
            // Standard name ("nep171").
            standard: NFT_STANDARD_NAME,
            // Version of the standard ("nft-1.0.0").
            version: NFT_METADATA_SPEC,
            // The data related with the event stored in a vector.
            event: "nft_transfer",
            data: [
                {
                    // The optional authorized account ID to transfer the token on behalf of the old owner.
                    authorized_id: authorizedId,
                    // The old owner's account ID.
                    old_owner_id: token.owner_id,
                    // The account ID of the new owner of the token.
                    new_owner_id: receiverId,
                    // A vector containing the token IDs as strings.
                    token_ids: [tokenId],
                    // An optional memo to include.
                    memo,
                }
            ]
        }
    
        // Log the serialized json.
        near.log(JSON.stringify(nftTransferLog));
    
        //return the previous token object that was transferred.
        return token
    }
    internalRemoveTokenFromOwner(contract: Contract, accountId: string, tokenId: string) {
        //we get the set of tokens that the owner has
        let tokenSet = UnorderedSet.deserialize(contract.tokensPerOwner.get(accountId) as UnorderedSet)
        //if there is no set of tokens for the owner, we panic with the following message:
        if (tokenSet == null) {
            near.panic("Token should be owned by the sender");
        }
    
        //we remove the the token_id from the set of tokens
        tokenSet.remove(tokenId)
    
        //if the token set is now empty, we remove the owner from the tokens_per_owner collection
        if (tokenSet.isEmpty()) {
            contract.tokensPerOwner.remove(accountId);
        } else { //if the token set is not empty, we simply insert it back for the account ID. 
            contract.tokensPerOwner.set(accountId, tokenSet);
        }
    }

    internalAddTokenToOwner(contract: Contract, accountId: string, tokenId: string) {
        //get the set of tokens for the given account
        let tokenSet = UnorderedSet.deserialize(contract.tokensPerOwner.get(accountId) as UnorderedSet)
    
        if(tokenSet == null) {
            //if the account doesn't have any tokens, we create a new unordered set
            tokenSet = new UnorderedSet("tokensPerOwner" + accountId.toString());
        }
    
        //we insert the token ID into the set
        tokenSet.set(tokenId);
    
        //we insert that set for the given account ID. 
        contract.tokensPerOwner.set(accountId, tokenSet);
    }

    internalResolveTransfer({
        contract,
        authorizedId,
        ownerId,
        receiverId,
        tokenId,
        approvedAccountIds,
        memo
    }:{
        contract: Contract,
        authorizedId: string,
        ownerId: string,
        receiverId: string,
        tokenId: string,
        approvedAccountIds: { [key: string]: number },
        memo: string    
    }) {
        assert(near.currentAccountId() === near.predecessorAccountId(), "Only the contract itself can call this method");
        // Whether receiver wants to return token back to the sender, based on `nft_on_transfer`
        // call result.
        let result = near.promiseResult(0);
        if (typeof result === 'string') {
            //As per the standard, the nft_on_transfer should return whether we should return the token to it's owner or not
            //if we need don't need to return the token, we simply return true meaning everything went fine
            if (result === 'false') {
                /* 
                    since we've already transferred the token and nft_on_transfer returned false, we don't have to 
                    revert the original transfer and thus we can just return true since nothing went wrong.
                */
                //we refund the owner for releasing the storage used up by the approved account IDs
                return true;
            }
        }
    

    
        //we remove the token from the receiver
        this.internalRemoveTokenFromOwner(contract, receiverId, tokenId);
        //we add the token to the original owner
        this.internalAddTokenToOwner(contract, ownerId, tokenId);
    
    
    
        /*
            We need to log that the NFT was reverted back to the original owner.
            The old_owner_id will be the receiver and the new_owner_id will be the
            original owner of the token since we're reverting the transfer.
        */
    
        // Construct the transfer log as per the events standard.
        let nftTransferLog = {
            // Standard name ("nep171").
            standard: NFT_STANDARD_NAME,
            // Version of the standard ("nft-1.0.0").
            version: NFT_METADATA_SPEC,
            // The data related with the event stored in a vector.
            event: "nft_transfer",
            data: [
                {
                    // The optional authorized account ID to transfer the token on behalf of the old owner.
                    authorized_id: authorizedId,
                    // The old owner's account ID.
                    old_owner_id: receiverId,
                    // The account ID of the new owner of the token.
                    new_owner_id: ownerId,
                    // A vector containing the token IDs as strings.
                    token_ids: [tokenId],
                    // An optional memo to include.
                    memo,
                }
            ]
        }
    
        // Log the serialized json.
        near.log(JSON.stringify(nftTransferLog));
    
        //return false
        return false
    }
}