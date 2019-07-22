import { RecordIdentifier } from '../ts-interfaces/identifier';
import { Request, FindRecordQuery, RequestState, SaveRecordMutation, Operation } from './fetch-manager';

import { _findHasMany, _findBelongsTo, _findAll, _query, _queryRecord } from './store/finders';

const touching = Symbol('touching');
export const requestPromise = Symbol('promise');

enum RequestStateEnum {
  pending = 'pending',
  fulfilled = 'fulfilled',
  rejected = 'rejected',
}

export interface InternalRequest extends RequestState {
  [touching]: RecordIdentifier[];
  [requestPromise]?: Promise<any>;
}

type RecordOperation = FindRecordQuery | SaveRecordMutation;

function hasRecordIdentifier(op: Operation): op is RecordOperation {
  return 'recordIdentifier' in op;
}

export default class RequestCache {
  _pending: { [lid: string]: InternalRequest[] };
  _done: { [lid: string]: InternalRequest[] };
  _subscriptions: { [lid: string]: Function[] };

  constructor() {
    this._pending = Object.create(null);
    this._done = Object.create(null);
    this._subscriptions = Object.create(null);
  }

  enqueue(promise: Promise<any>, queryRequest: Request) {
    let query = queryRequest.data[0];
    if (hasRecordIdentifier(query)) {
      let lid = query.recordIdentifier.lid;
      let type = query.op === 'saveRecord' ? <const>'mutation' : <const>'query';
      if (!this._pending[lid]) {
        this._pending[lid] = [];
      }
      let request: InternalRequest = {
        state: RequestStateEnum.pending,
        request: queryRequest,
        type,
        [touching]: [query.recordIdentifier],
        [requestPromise]: promise,
      };
      this._pending[lid].push(request);
      this._triggerSubscriptions(request);
      promise.then(
        result => {
          this._dequeue(lid, request);
          let finalizedRequest = {
            state: RequestStateEnum.fulfilled,
            request: queryRequest,
            type,
            [touching]: request[touching],
            response: { data: result },
          };
          this._addDone(finalizedRequest);
          this._triggerSubscriptions(finalizedRequest);
        },
        error => {
          this._dequeue(lid, request);
          let finalizedRequest = {
            state: RequestStateEnum.rejected,
            request: queryRequest,
            type,
            [touching]: request[touching],
            response: { data: error && error.error },
          };
          this._addDone(finalizedRequest);
          this._triggerSubscriptions(finalizedRequest);
        }
      );
    }
  }

  _triggerSubscriptions(req: InternalRequest) {
    req[touching].forEach(identifier => {
      if (this._subscriptions[identifier.lid]) {
        this._subscriptions[identifier.lid].forEach(callback => callback(req));
      }
    });
  }

  _dequeue(lid: string, request: InternalRequest) {
    this._pending[lid] = this._pending[lid].filter(req => req !== request);
  }

  _addDone(request: InternalRequest) {
    request[touching].forEach(identifier => {
      if (!this._done[identifier.lid]) {
        this._done[identifier.lid] = [];
      }
      // TODO add support for multiple
      let requestDataOp = request.request.data instanceof Array ? request.request.data[0].op : request.request.data.op;
      this._done[identifier.lid] = this._done[identifier.lid].filter(req => {
        // TODO add support for multiple
        let data;
        if (req.request.data instanceof Array) {
          data = req.request.data[0];
        } else {
          data = req.request.data;
        }
        return data.op !== requestDataOp;
      });
      this._done[identifier.lid].push(request);
    });
  }

  subscribeForRecord(identifier: RecordIdentifier, callback: (requestState: RequestState) => void) {
    if (!this._subscriptions[identifier.lid]) {
      this._subscriptions[identifier.lid] = [];
    }
    this._subscriptions[identifier.lid].push(callback);
  }

  getPendingRequestsForRecord(identifier: RecordIdentifier): RequestState[] {
    if (this._pending[identifier.lid]) {
      return this._pending[identifier.lid];
    }
    return [];
  }

  getLastRequestForRecord(identifier: RecordIdentifier): RequestState | null {
    let requests = this._done[identifier.lid];
    if (requests) {
      return requests[requests.length - 1];
    }
    return null;
  }
}
