function _applyDecoratedDescriptor(target, property, decorators, descriptor, context) {
  var desc = {};
  Object.keys(descriptor).forEach(function (key) {
    desc[key] = descriptor[key];
  });
  desc.enumerable = !!desc.enumerable;
  desc.configurable = !!desc.configurable;

  if ('value' in desc || desc.initializer) {
    desc.writable = true;
  }

  desc = decorators.slice().reverse().reduce(function (desc, decorator) {
    return decorator(target, property, desc) || desc;
  }, desc);

  if (context && desc.initializer !== void 0) {
    desc.value = desc.initializer ? desc.initializer.call(context) : void 0;
    desc.initializer = undefined;
  }

  if (desc.initializer === void 0) {
    Object.defineProperty(target, property, desc);
    desc = null;
  }

  return desc;
}

function call(target, key, descriptor) {}
function view(target, key, descriptor) {}
function NearBindgen(target) {
  return class extends target {
    static _init() {
      // @ts-ignore
      let args = target.deserializeArgs();
      let ret = new target(args); // @ts-ignore

      ret.init(); // @ts-ignore

      ret.serialize();
      return ret;
    }

    static _get() {
      let ret = Object.create(target.prototype);
      return ret;
    }

  };
}

const U64_MAX = 2n ** 64n - 1n;
const EVICTED_REGISTER = U64_MAX - 1n;
function log(...params) {
  env.log(`${params.map(x => x === undefined ? 'undefined' : x) // Stringify undefined
  .map(x => typeof x === 'object' ? JSON.stringify(x) : x) // Convert Objects to strings
  .join(' ')}` // Convert to string
  );
}
function predecessorAccountId() {
  env.predecessor_account_id(0);
  return env.read_register(0);
}
function panic(msg) {
  if (msg !== undefined) {
    env.panic(msg);
  } else {
    env.panic();
  }
}
function storageRead(key) {
  let ret = env.storage_read(key, 0);

  if (ret === 1n) {
    return env.read_register(0);
  } else {
    return null;
  }
}
function storageHasKey(key) {
  let ret = env.storage_has_key(key);

  if (ret === 1n) {
    return true;
  } else {
    return false;
  }
}
function storageGetEvicted() {
  return env.read_register(EVICTED_REGISTER);
}

function currentAccountId() {
  env.current_account_id(0);
  return env.read_register(0);
}
function input() {
  env.input(0);
  return env.read_register(0);
}
function storageUsage() {
  return env.storage_usage();
}
function promiseThen(promiseIndex, accountId, methodName, args, amount, gas) {
  return env.promise_then(promiseIndex, accountId, methodName, args, amount, gas);
}
function promiseBatchCreate(accountId) {
  return env.promise_batch_create(accountId);
}
function promiseBatchActionFunctionCall(promiseIndex, methodName, args, amount, gas) {
  env.promise_batch_action_function_call(promiseIndex, methodName, args, amount, gas);
}
var PromiseResult;

(function (PromiseResult) {
  PromiseResult[PromiseResult["NotReady"] = 0] = "NotReady";
  PromiseResult[PromiseResult["Successful"] = 1] = "Successful";
  PromiseResult[PromiseResult["Failed"] = 2] = "Failed";
})(PromiseResult || (PromiseResult = {}));

function promiseResult(resultIdx) {
  let status = env.promise_result(resultIdx, 0);

  if (status == PromiseResult.Successful) {
    return env.read_register(0);
  } else if (status == PromiseResult.Failed || status == PromiseResult.NotReady) {
    return status;
  } else {
    panic(`Unexpected return code: ${status}`);
  }
}
function promiseReturn(promiseIdx) {
  env.promise_return(promiseIdx);
}
function storageWrite(key, value) {
  let exist = env.storage_write(key, value, EVICTED_REGISTER);

  if (exist === 1n) {
    return true;
  }

  return false;
}
function storageRemove(key) {
  let exist = env.storage_remove(key, EVICTED_REGISTER);

  if (exist === 1n) {
    return true;
  }

  return false;
}

class NearContract {
  deserialize() {
    const rawState = storageRead("STATE");

    if (rawState) {
      const state = JSON.parse(rawState); // reconstruction of the contract class object from plain object

      let c = this.default();
      Object.assign(this, state);

      for (const item in c) {
        if (c[item].constructor?.deserialize !== undefined) {
          this[item] = c[item].constructor.deserialize(this[item]);
        }
      }
    } else {
      throw new Error("Contract state is empty");
    }
  }

  serialize() {
    storageWrite("STATE", JSON.stringify(this));
  }

  static deserializeArgs() {
    let args = input();
    return JSON.parse(args || "{}");
  }

  static serializeReturn(ret) {
    return JSON.stringify(ret);
  }

  init() {}

}

class LookupMap {
  constructor(keyPrefix) {
    this.keyPrefix = keyPrefix;
  }

  containsKey(key) {
    let storageKey = this.keyPrefix + JSON.stringify(key);
    return storageHasKey(storageKey);
  }

  get(key) {
    let storageKey = this.keyPrefix + JSON.stringify(key);
    let raw = storageRead(storageKey);

    if (raw !== null) {
      return JSON.parse(raw);
    }

    return null;
  }

  remove(key) {
    let storageKey = this.keyPrefix + JSON.stringify(key);

    if (storageRemove(storageKey)) {
      return JSON.parse(storageGetEvicted());
    }

    return null;
  }

  set(key, value) {
    let storageKey = this.keyPrefix + JSON.stringify(key);
    let storageValue = JSON.stringify(value);

    if (storageWrite(storageKey, storageValue)) {
      return JSON.parse(storageGetEvicted());
    }

    return null;
  }

  extend(objects) {
    for (let kv of objects) {
      this.set(kv[0], kv[1]);
    }
  }

  serialize() {
    return JSON.stringify(this);
  } // converting plain object to class object


  static deserialize(data) {
    return new LookupMap(data.keyPrefix);
  }

}

function u8ArrayToBytes(array) {
  let ret = "";

  for (let e of array) {
    ret += String.fromCharCode(e);
  }

  return ret;
} // TODO this function is a bit broken and the type can't be string
// TODO for more info: https://github.com/near/near-sdk-js/issues/78

function bytesToU8Array(bytes) {
  let ret = new Uint8Array(bytes.length);

  for (let i = 0; i < bytes.length; i++) {
    ret[i] = bytes.charCodeAt(i);
  }

  return ret;
}

function assert(b, str) {
  if (b) {
    return;
  } else {
    throw Error("assertion failed: " + str);
  }
}

const ERR_INDEX_OUT_OF_BOUNDS = "Index out of bounds";
const ERR_INCONSISTENT_STATE$2 = "The collection is an inconsistent state. Did previous smart contract execution terminate unexpectedly?";

function indexToKey(prefix, index) {
  let data = new Uint32Array([index]);
  let array = new Uint8Array(data.buffer);
  let key = u8ArrayToBytes(array);
  return prefix + key;
} /// An iterable implementation of vector that stores its content on the trie.
/// Uses the following map: index -> element


class Vector {
  constructor(prefix) {
    this.length = 0;
    this.prefix = prefix;
  }

  len() {
    return this.length;
  }

  isEmpty() {
    return this.length == 0;
  }

  get(index) {
    if (index >= this.length) {
      return null;
    }

    let storageKey = indexToKey(this.prefix, index);
    return JSON.parse(storageRead(storageKey));
  } /// Removes an element from the vector and returns it in serialized form.
  /// The removed element is replaced by the last element of the vector.
  /// Does not preserve ordering, but is `O(1)`.


  swapRemove(index) {
    if (index >= this.length) {
      throw new Error(ERR_INDEX_OUT_OF_BOUNDS);
    } else if (index + 1 == this.length) {
      return this.pop();
    } else {
      let key = indexToKey(this.prefix, index);
      let last = this.pop();

      if (storageWrite(key, JSON.stringify(last))) {
        return JSON.parse(storageGetEvicted());
      } else {
        throw new Error(ERR_INCONSISTENT_STATE$2);
      }
    }
  }

  push(element) {
    let key = indexToKey(this.prefix, this.length);
    this.length += 1;
    storageWrite(key, JSON.stringify(element));
  }

  pop() {
    if (this.isEmpty()) {
      return null;
    } else {
      let lastIndex = this.length - 1;
      let lastKey = indexToKey(this.prefix, lastIndex);
      this.length -= 1;

      if (storageRemove(lastKey)) {
        return JSON.parse(storageGetEvicted());
      } else {
        throw new Error(ERR_INCONSISTENT_STATE$2);
      }
    }
  }

  replace(index, element) {
    if (index >= this.length) {
      throw new Error(ERR_INDEX_OUT_OF_BOUNDS);
    } else {
      let key = indexToKey(this.prefix, index);

      if (storageWrite(key, JSON.stringify(element))) {
        return JSON.parse(storageGetEvicted());
      } else {
        throw new Error(ERR_INCONSISTENT_STATE$2);
      }
    }
  }

  extend(elements) {
    for (let element of elements) {
      this.push(element);
    }
  }

  [Symbol.iterator]() {
    return new VectorIterator(this);
  }

  clear() {
    for (let i = 0; i < this.length; i++) {
      let key = indexToKey(this.prefix, i);
      storageRemove(key);
    }

    this.length = 0;
  }

  toArray() {
    let ret = [];

    for (let v of this) {
      ret.push(v);
    }

    return ret;
  }

  serialize() {
    return JSON.stringify(this);
  } // converting plain object to class object


  static deserialize(data) {
    let vector = new Vector(data.prefix);
    vector.length = data.length;
    return vector;
  }

}
class VectorIterator {
  constructor(vector) {
    this.current = 0;
    this.vector = vector;
  }

  next() {
    if (this.current < this.vector.len()) {
      let value = this.vector.get(this.current);
      this.current += 1;
      return {
        value,
        done: false
      };
    }

    return {
      value: null,
      done: true
    };
  }

}

const ERR_INCONSISTENT_STATE$1 = "The collection is an inconsistent state. Did previous smart contract execution terminate unexpectedly?";
class UnorderedMap {
  constructor(prefix) {
    this.length = 0;
    this.prefix = prefix;
    this.keyIndexPrefix = prefix + "i";
    let indexKey = prefix + "k";
    let indexValue = prefix + "v";
    this.keys = new Vector(indexKey);
    this.values = new Vector(indexValue);
  }

  len() {
    let keysLen = this.keys.len();
    let valuesLen = this.values.len();

    if (keysLen != valuesLen) {
      throw new Error(ERR_INCONSISTENT_STATE$1);
    }

    return keysLen;
  }

  isEmpty() {
    let keysIsEmpty = this.keys.isEmpty();
    let valuesIsEmpty = this.values.isEmpty();

    if (keysIsEmpty != valuesIsEmpty) {
      throw new Error(ERR_INCONSISTENT_STATE$1);
    }

    return keysIsEmpty;
  }

  serializeIndex(index) {
    let data = new Uint32Array([index]);
    let array = new Uint8Array(data.buffer);
    return u8ArrayToBytes(array);
  }

  deserializeIndex(rawIndex) {
    let array = bytesToU8Array(rawIndex);
    let data = new Uint32Array(array.buffer);
    return data[0];
  }

  getIndexRaw(key) {
    let indexLookup = this.keyIndexPrefix + JSON.stringify(key);
    let indexRaw = storageRead(indexLookup);
    return indexRaw;
  }

  get(key) {
    let indexRaw = this.getIndexRaw(key);

    if (indexRaw) {
      let index = this.deserializeIndex(indexRaw);
      let value = this.values.get(index);

      if (value) {
        return value;
      } else {
        throw new Error(ERR_INCONSISTENT_STATE$1);
      }
    }

    return null;
  }

  set(key, value) {
    let indexLookup = this.keyIndexPrefix + JSON.stringify(key);
    let indexRaw = storageRead(indexLookup);

    if (indexRaw) {
      let index = this.deserializeIndex(indexRaw);
      return this.values.replace(index, value);
    } else {
      let nextIndex = this.len();
      let nextIndexRaw = this.serializeIndex(nextIndex);
      storageWrite(indexLookup, nextIndexRaw);
      this.keys.push(key);
      this.values.push(value);
      return null;
    }
  }

  remove(key) {
    let indexLookup = this.keyIndexPrefix + JSON.stringify(key);
    let indexRaw = storageRead(indexLookup);

    if (indexRaw) {
      if (this.len() == 1) {
        // If there is only one element then swap remove simply removes it without
        // swapping with the last element.
        storageRemove(indexLookup);
      } else {
        // If there is more than one element then swap remove swaps it with the last
        // element.
        let lastKey = this.keys.get(this.len() - 1);

        if (!lastKey) {
          throw new Error(ERR_INCONSISTENT_STATE$1);
        }

        storageRemove(indexLookup); // If the removed element was the last element from keys, then we don't need to
        // reinsert the lookup back.

        if (lastKey != key) {
          let lastLookupKey = this.keyIndexPrefix + JSON.stringify(lastKey);
          storageWrite(lastLookupKey, indexRaw);
        }
      }

      let index = this.deserializeIndex(indexRaw);
      this.keys.swapRemove(index);
      return this.values.swapRemove(index);
    }

    return null;
  }

  clear() {
    for (let key of this.keys) {
      let indexLookup = this.keyIndexPrefix + JSON.stringify(key);
      storageRemove(indexLookup);
    }

    this.keys.clear();
    this.values.clear();
  }

  toArray() {
    let ret = [];

    for (let v of this) {
      ret.push(v);
    }

    return ret;
  }

  [Symbol.iterator]() {
    return new UnorderedMapIterator(this);
  }

  extend(kvs) {
    for (let [k, v] of kvs) {
      this.set(k, v);
    }
  }

  serialize() {
    return JSON.stringify(this);
  } // converting plain object to class object


  static deserialize(data) {
    let map = new UnorderedMap(data.prefix); // reconstruct UnorderedMap

    map.length = data.length; // reconstruct keys Vector

    map.keys = new Vector(data.prefix + "k");
    map.keys.length = data.keys.length; // reconstruct values Vector

    map.values = new Vector(data.prefix + "v");
    map.values.length = data.values.length;
    return map;
  }

}

class UnorderedMapIterator {
  constructor(unorderedMap) {
    this.keys = new VectorIterator(unorderedMap.keys);
    this.values = new VectorIterator(unorderedMap.values);
  }

  next() {
    let key = this.keys.next();
    let value = this.values.next();

    if (key.done != value.done) {
      throw new Error(ERR_INCONSISTENT_STATE$1);
    }

    return {
      value: [key.value, value.value],
      done: key.done
    };
  }

}

const ERR_INCONSISTENT_STATE = "The collection is an inconsistent state. Did previous smart contract execution terminate unexpectedly?";
class UnorderedSet {
  constructor(prefix) {
    this.length = 0;
    this.prefix = prefix;
    this.elementIndexPrefix = prefix + "i";
    let elementsPrefix = prefix + "e";
    this.elements = new Vector(elementsPrefix);
  }

  len() {
    return this.elements.len();
  }

  isEmpty() {
    return this.elements.isEmpty();
  }

  serializeIndex(index) {
    let data = new Uint32Array([index]);
    let array = new Uint8Array(data.buffer);
    return u8ArrayToBytes(array);
  }

  deserializeIndex(rawIndex) {
    let array = bytesToU8Array(rawIndex);
    let data = new Uint32Array(array.buffer);
    return data[0];
  }

  contains(element) {
    let indexLookup = this.elementIndexPrefix + JSON.stringify(element);
    return storageHasKey(indexLookup);
  }

  set(element) {
    let indexLookup = this.elementIndexPrefix + JSON.stringify(element);

    if (storageRead(indexLookup)) {
      return false;
    } else {
      let nextIndex = this.len();
      let nextIndexRaw = this.serializeIndex(nextIndex);
      storageWrite(indexLookup, nextIndexRaw);
      this.elements.push(element);
      return true;
    }
  }

  remove(element) {
    let indexLookup = this.elementIndexPrefix + JSON.stringify(element);
    let indexRaw = storageRead(indexLookup);

    if (indexRaw) {
      if (this.len() == 1) {
        // If there is only one element then swap remove simply removes it without
        // swapping with the last element.
        storageRemove(indexLookup);
      } else {
        // If there is more than one element then swap remove swaps it with the last
        // element.
        let lastElement = this.elements.get(this.len() - 1);

        if (!lastElement) {
          throw new Error(ERR_INCONSISTENT_STATE);
        }

        storageRemove(indexLookup); // If the removed element was the last element from keys, then we don't need to
        // reinsert the lookup back.

        if (lastElement != element) {
          let lastLookupElement = this.elementIndexPrefix + JSON.stringify(lastElement);
          storageWrite(lastLookupElement, indexRaw);
        }
      }

      let index = this.deserializeIndex(indexRaw);
      this.elements.swapRemove(index);
      return true;
    }

    return false;
  }

  clear() {
    for (let element of this.elements) {
      let indexLookup = this.elementIndexPrefix + JSON.stringify(element);
      storageRemove(indexLookup);
    }

    this.elements.clear();
  }

  toArray() {
    let ret = [];

    for (let v of this) {
      ret.push(v);
    }

    return ret;
  }

  [Symbol.iterator]() {
    return this.elements[Symbol.iterator]();
  }

  extend(elements) {
    for (let element of elements) {
      this.set(element);
    }
  }

  serialize() {
    return JSON.stringify(this);
  } // converting plain object to class object


  static deserialize(data) {
    let set = new UnorderedSet(data.prefix); // reconstruct UnorderedSet

    set.length = data.length; // reconstruct Vector

    let elementsPrefix = data.prefix + "e";
    set.elements = new Vector(elementsPrefix);
    set.elements.length = data.elements.length;
    return set;
  }

}

//defines the payout type we'll be returning as a part of the royalty standards.
class Token {
  constructor({
    ownerId,
    approvedAccountIds,
    nextApprovalId,
    royalty
  }) {
    //owner of the token
    this.owner_id = ownerId, //list of approved account IDs that have access to transfer the token. This maps an account ID to an approval ID
    this.approved_account_ids = approvedAccountIds, //the next approval ID to give out. 
    this.next_approval_id = nextApprovalId, //keep track of the royalty percentages for the token in a hash map
    this.royalty = royalty;
  }

} //The Json token is what will be returned from view calls. 

class JsonToken {
  constructor({
    tokenId,
    ownerId,
    metadata,
    approvedAccountIds,
    royalty
  }) {
    //token ID
    this.token_id = tokenId, //owner of the token
    this.owner_id = ownerId, //token metadata
    this.metadata = metadata, //list of approved account IDs that have access to transfer the token. This maps an account ID to an approval ID
    this.approved_account_ids = approvedAccountIds, //keep track of the royalty percentages for the token in a hash map
    this.royalty = royalty;
  }

} //get the information for a specific token ID

var _class, _class2;
// import { internalNftToken, internalNftTransfer, internalNftTransferCall, internalResolveTransfer } from './nft_core';

const GAS_FOR_RESOLVE_TRANSFER = 40_000_000_000_000;
const GAS_FOR_NFT_ON_TRANSFER = 35_000_000_000_000;
/// This spec can be treated like a version of the standard.
const NFT_METADATA_SPEC = "nft-1.0.0"; /// This is the name of the NFT standard we're using

const NFT_STANDARD_NAME = "nep171";
let Contract = NearBindgen(_class = (_class2 = class Contract extends NearContract {
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
    super();
    this.owner_id = owner_id;
    this.tokensPerOwner = new LookupMap("tokensPerOwner");
    this.tokensById = new LookupMap("tokensById");
    this.tokenMetadataById = new UnorderedMap("tokenMetadataById");
    this.metadata = metadata;
  }

  default() {
    return new Contract({
      owner_id: ''
    });
  }
  /*
      MINT
  */


  nft_mint({
    token_id,
    metadata,
    receiver_id,
    perpetual_royalties
  }) {
    return this.internalMint({
      contract: this,
      tokenId: token_id,
      metadata: metadata,
      receiverId: receiver_id,
      perpetualRoyalties: perpetual_royalties
    });
  }
  /*
      CORE
  */


  //get the information for a specific token ID
  nft_token({
    token_id
  }) {
    return this.internalNftToken({
      contract: this,
      tokenId: token_id
    });
  }

  //implementation of the nft_transfer method. This transfers the NFT from the current owner to the receiver. 
  nft_transfer({
    receiver_id,
    token_id,
    approval_id,
    memo
  }) {
    return this.internalNftTransfer({
      contract: this,
      receiverId: receiver_id,
      tokenId: token_id,
      approvalId: approval_id,
      memo: memo
    });
  }

  //implementation of the transfer call method. This will transfer the NFT and call a method on the receiver_id contract
  nft_transfer_call({
    receiver_id,
    token_id,
    approval_id,
    memo,
    msg
  }) {
    return this.internalNftTransferCall({
      contract: this,
      receiverId: receiver_id,
      tokenId: token_id,
      approvalId: approval_id,
      memo: memo,
      msg: msg
    });
  }

  //resolves the cross contract call when calling nft_on_transfer in the nft_transfer_call method
  //returns true if the token was successfully transferred to the receiver_id
  nft_resolve_transfer({
    authorized_id,
    owner_id,
    receiver_id,
    token_id,
    approved_account_ids,
    memo
  }) {
    return this.internalResolveTransfer({
      contract: this,
      authorizedId: authorized_id,
      ownerId: owner_id,
      receiverId: receiver_id,
      tokenId: token_id,
      approvedAccountIds: approved_account_ids,
      memo: memo
    });
  } // ***** Helper functions *****//


  internalMint({
    contract,
    tokenId,
    metadata,
    receiverId,
    perpetualRoyalties
  }) {
    //measure the initial storage being used on the contract TODO
    storageUsage(); // create a royalty map to store in the token

    let royalty = {}; // if perpetual royalties were passed into the function: TODO: add isUndefined fn

    if (perpetualRoyalties != null) {
      //make sure that the length of the perpetual royalties is below 7 since we won't have enough GAS to pay out that many people
      assert(Object.keys(perpetualRoyalties).length < 7, "Cannot add more than 6 perpetual royalty amounts"); //iterate through the perpetual royalties and insert the account and amount in the royalty map

      Object.entries(perpetualRoyalties).forEach(([account, amount], index) => {
        royalty[account] = amount;
      });
    } //specify the token struct that contains the owner ID 


    let token = new Token({
      //set the owner ID equal to the receiver ID passed into the function
      ownerId: receiverId,
      //we set the approved account IDs to the default value (an empty map)
      approvedAccountIds: {},
      //the next approval ID is set to 0
      nextApprovalId: 0,
      //the map of perpetual royalties for the token (The owner will get 100% - total perpetual royalties)
      royalty
    }); //insert the token ID and token struct and make sure that the token doesn't exist

    assert(!contract.tokensById.containsKey(tokenId), "Token already exists");
    contract.tokensById.set(tokenId, token); //insert the token ID and metadata

    contract.tokenMetadataById.set(tokenId, metadata); //call the internal method for adding the token to the owner

    this.internalAddTokenToOwner(contract, token.owner_id, tokenId); // Construct the mint log as per the events standard.

    let nftMintLog = {
      // Standard name ("nep171").
      standard: NFT_STANDARD_NAME,
      // Version of the standard ("nft-1.0.0").
      version: NFT_METADATA_SPEC,
      // The data related with the event stored in a vector.
      event: "nft_mint",
      data: [{
        // Owner of the token.
        owner_id: token.owner_id,
        // Vector of token IDs that were minted.
        token_ids: [tokenId]
      }]
    }; // Log the json.

    log(`EVENT_JSON:${JSON.stringify(nftMintLog)}`);
  }

  internalNftToken({
    contract,
    tokenId
  }) {
    let token = contract.tokensById.get(tokenId); //if there wasn't a token ID in the tokens_by_id collection, we return None

    if (token == null) {
      return null;
    } //if there is some token ID in the tokens_by_id collection
    //we'll get the metadata for that token


    let metadata = contract.tokenMetadataById.get(tokenId); //we return the JsonToken

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
    memo
  }) {}

  internalNftTransferCall({
    contract,
    receiverId,
    tokenId,
    approvalId,
    memo,
    msg
  }) {
    //get the sender to transfer the token from the sender to the receiver
    let senderId = predecessorAccountId(); //call the internal transfer method and get back the previous token so we can refund the approved account IDs

    let previousToken = this.internalTransfer(contract, senderId, receiverId, tokenId, approvalId, memo); // Initiating receiver's call and the callback

    const promise = promiseBatchCreate(receiverId);
    promiseBatchActionFunctionCall(promise, "nft_on_transfer", bytes(JSON.stringify({
      sender_id: senderId,
      previous_owner_id: previousToken.owner_id,
      token_id: tokenId,
      msg
    })), 0, // no deposit 
    GAS_FOR_NFT_ON_TRANSFER); // We then resolve the promise and call nft_resolve_transfer on our own contract

    promiseThen(promise, currentAccountId(), "nft_resolve_transfer", bytes(JSON.stringify({
      owner_id: previousToken.owner_id,
      receiver_id: receiverId,
      token_id: tokenId,
      approved_account_ids: previousToken.approved_account_ids
    })), 0, // no deposit 
    GAS_FOR_RESOLVE_TRANSFER);
    return promiseReturn(promise);
  }

  internalTransfer(contract, senderId, receiverId, tokenId, approvalId, memo) {
    //get the token object by passing in the token_id
    let token = contract.tokensById.get(tokenId);

    if (token == null) {
      panic("no token found");
    } //if the sender doesn't equal the owner, we check if the sender is in the approval list


    if (senderId != token.owner_id) {
      //if the token's approved account IDs doesn't contain the sender, we panic
      if (!token.approved_account_ids.hasOwnProperty(senderId)) {
        panic("Unauthorized");
      } // If they included an approval_id, check if the sender's actual approval_id is the same as the one included


      if (approvalId != null) {
        //get the actual approval ID
        let actualApprovalId = token.approved_account_ids[senderId]; //if the sender isn't in the map, we panic

        if (actualApprovalId == null) {
          panic("Sender is not approved account");
        } //make sure that the actual approval ID is the same as the one provided


        assert(actualApprovalId == approvalId, `The actual approval_id ${actualApprovalId} is different from the given approval_id ${approvalId}`);
      }
    } //we make sure that the sender isn't sending the token to themselves


    assert(token.owner_id != receiverId, "The token owner and the receiver should be different"); //we remove the token from it's current owner's set

    this.internalRemoveTokenFromOwner(contract, token.owner_id, tokenId); //we then add the token to the receiver_id's set

    this.internalAddTokenToOwner(contract, receiverId, tokenId); //we create a new token struct 

    let newToken = new Token({
      ownerId: receiverId,
      //reset the approval account IDs
      approvedAccountIds: {},
      nextApprovalId: token.next_approval_id,
      //we copy over the royalties from the previous token
      royalty: token.royalty
    }); //insert that new token into the tokens_by_id, replacing the old entry 

    contract.tokensById.set(tokenId, newToken); //if there was some memo attached, we log it. 

    if (memo != null) {
      log(`Memo: ${memo}`);
    } // Default the authorized ID to be None for the logs.


    let authorizedId; //if the approval ID was provided, set the authorized ID equal to the sender

    if (approvalId != null) {
      authorizedId = senderId;
    } // Construct the transfer log as per the events standard.


    let nftTransferLog = {
      // Standard name ("nep171").
      standard: NFT_STANDARD_NAME,
      // Version of the standard ("nft-1.0.0").
      version: NFT_METADATA_SPEC,
      // The data related with the event stored in a vector.
      event: "nft_transfer",
      data: [{
        // The optional authorized account ID to transfer the token on behalf of the old owner.
        authorized_id: authorizedId,
        // The old owner's account ID.
        old_owner_id: token.owner_id,
        // The account ID of the new owner of the token.
        new_owner_id: receiverId,
        // A vector containing the token IDs as strings.
        token_ids: [tokenId],
        // An optional memo to include.
        memo
      }]
    }; // Log the serialized json.

    log(JSON.stringify(nftTransferLog)); //return the previous token object that was transferred.

    return token;
  }

  internalRemoveTokenFromOwner(contract, accountId, tokenId) {
    //we get the set of tokens that the owner has
    let tokenSet = UnorderedSet.deserialize(contract.tokensPerOwner.get(accountId)); //if there is no set of tokens for the owner, we panic with the following message:

    if (tokenSet == null) {
      panic("Token should be owned by the sender");
    } //we remove the the token_id from the set of tokens


    tokenSet.remove(tokenId); //if the token set is now empty, we remove the owner from the tokens_per_owner collection

    if (tokenSet.isEmpty()) {
      contract.tokensPerOwner.remove(accountId);
    } else {
      //if the token set is not empty, we simply insert it back for the account ID. 
      contract.tokensPerOwner.set(accountId, tokenSet);
    }
  }

  internalAddTokenToOwner(contract, accountId, tokenId) {
    //get the set of tokens for the given account
    let tokenSet = UnorderedSet.deserialize(contract.tokensPerOwner.get(accountId));

    if (tokenSet == null) {
      //if the account doesn't have any tokens, we create a new unordered set
      tokenSet = new UnorderedSet("tokensPerOwner" + accountId.toString());
    } //we insert the token ID into the set


    tokenSet.set(tokenId); //we insert that set for the given account ID. 

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
  }) {
    assert(currentAccountId() === predecessorAccountId(), "Only the contract itself can call this method"); // Whether receiver wants to return token back to the sender, based on `nft_on_transfer`
    // call result.

    let result = promiseResult(0);

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
    } //we remove the token from the receiver


    this.internalRemoveTokenFromOwner(contract, receiverId, tokenId); //we add the token to the original owner

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
      data: [{
        // The optional authorized account ID to transfer the token on behalf of the old owner.
        authorized_id: authorizedId,
        // The old owner's account ID.
        old_owner_id: receiverId,
        // The account ID of the new owner of the token.
        new_owner_id: ownerId,
        // A vector containing the token IDs as strings.
        token_ids: [tokenId],
        // An optional memo to include.
        memo
      }]
    }; // Log the serialized json.

    log(JSON.stringify(nftTransferLog)); //return false

    return false;
  }

}, (_applyDecoratedDescriptor(_class2.prototype, "nft_mint", [call], Object.getOwnPropertyDescriptor(_class2.prototype, "nft_mint"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "nft_token", [view], Object.getOwnPropertyDescriptor(_class2.prototype, "nft_token"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "nft_transfer", [call], Object.getOwnPropertyDescriptor(_class2.prototype, "nft_transfer"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "nft_transfer_call", [call], Object.getOwnPropertyDescriptor(_class2.prototype, "nft_transfer_call"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "nft_resolve_transfer", [call], Object.getOwnPropertyDescriptor(_class2.prototype, "nft_resolve_transfer"), _class2.prototype)), _class2)) || _class;
function init() {
  Contract._init();
}
function nft_resolve_transfer() {
  let _contract = Contract._get();

  _contract.deserialize();

  let args = _contract.constructor.deserializeArgs();

  let ret = _contract.nft_resolve_transfer(args);

  _contract.serialize();

  if (ret !== undefined) env.value_return(_contract.constructor.serializeReturn(ret));
}
function nft_transfer_call() {
  let _contract = Contract._get();

  _contract.deserialize();

  let args = _contract.constructor.deserializeArgs();

  let ret = _contract.nft_transfer_call(args);

  _contract.serialize();

  if (ret !== undefined) env.value_return(_contract.constructor.serializeReturn(ret));
}
function nft_transfer() {
  let _contract = Contract._get();

  _contract.deserialize();

  let args = _contract.constructor.deserializeArgs();

  let ret = _contract.nft_transfer(args);

  _contract.serialize();

  if (ret !== undefined) env.value_return(_contract.constructor.serializeReturn(ret));
}
function nft_token() {
  let _contract = Contract._get();

  _contract.deserialize();

  let args = _contract.constructor.deserializeArgs();

  let ret = _contract.nft_token(args);
  if (ret !== undefined) env.value_return(_contract.constructor.serializeReturn(ret));
}
function nft_mint() {
  let _contract = Contract._get();

  _contract.deserialize();

  let args = _contract.constructor.deserializeArgs();

  let ret = _contract.nft_mint(args);

  _contract.serialize();

  if (ret !== undefined) env.value_return(_contract.constructor.serializeReturn(ret));
}

export { Contract, NFT_METADATA_SPEC, NFT_STANDARD_NAME, init, nft_mint, nft_resolve_transfer, nft_token, nft_transfer, nft_transfer_call };
//# sourceMappingURL=nft.js.map
