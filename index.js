// process.env.AWS_XRAY_CONTEXT_MISSING = 'LOG_ERROR';
// const AWSXRay = require('aws-xray-sdk-core');
//AWSXRay.captureAWS(require('aws-sdk'));
const AWS = require('aws-sdk');

const httpRunner = require('./httpRunner');

// Wrapper class for AWS Lambda
class Wrapped {
  constructor(mod, opts) {
    this.options = opts || {};

    this.lambdaModule = mod;
    const handler = this.options.handler || 'handler';

    if (mod[handler]) {
      this.handler = mod[handler];
    }
  }

  isAsync() {
    return this.options.InvocationType === 'Event';
  }

  runDirect(event, context, cb) {
    this.handler(event, context, cb);
  }

  runRemote(event, cb) {
    if (this.lambdaModule.region) {
      AWS.config.update({
        region: this.lambdaModule.region
      });
    }

    const lambda = new AWS.Lambda();
    const params = {
      FunctionName: this.lambdaModule.lambdaFunction,
      InvocationType: this.options.InvocationType || 'RequestResponse',
      LogType: this.options.LogType || 'None',
      Payload: JSON.stringify(event)
    };

    const safeParse = payload => {
      try {
        return JSON.parse(payload);
      } catch (error) {
        // just return the empty object as there was probably no payload
        return {};
      }
    };

    const decoratedCallback = (err, data) => {
      if (err) {
        return cb(err);
      }
      if (data.FunctionError) {
        return cb(Object.assign(new Error(safeParse(data.Payload).errorMessage), data));
      }

      return cb(null, safeParse(data.Payload));
    };

    if (this.isAsync()) {
      lambda.invoke(params, decoratedCallback);
    } else {
      lambda.invoke(params, decoratedCallback);
    }
  }

  runHttp(event, cb) {
    httpRunner(event, this.lambdaModule, cb);
  }

  runHandler(event, customContext, cb) {
    const runInternal = callback => {
      const defaultContext = {
        succeed: success => callback(null, success),
        fail: error => callback(error, null),
        done: (error, success) => callback(error, success)
      };

      const lambdaContext = Object.assign({}, defaultContext, customContext);

      try {
        if (this.handler) {
          if (isFunction(this.handler)) {
            return this.runDirect(event, lambdaContext, callback);
          }
          return callback('Handler is not a function');
        }
        if (isString(this.lambdaModule)) {
          return this.runHttp(event, callback);
        }
        return this.runRemote(event, callback);
      } catch (ex) {
        return callback(ex);
      }
    };

    return new Promise((resolve, reject) => {
      const promiseCallback = (error, response) => {
        if (error) {
          return reject(error);
        }
        return resolve(response);
      };

      const callback = cb || promiseCallback;

      return runInternal(callback);
    });
  }

  run(event, context, callback) {
    let callbackFunction = callback;
    let contextObject = context;
    if (typeof context === 'function') {
      // backwards compability
      callbackFunction = context;
      contextObject = {};
    }
    return this.runHandler(event, contextObject, callbackFunction);
  }
}

function isFunction(functionToCheck) {
  return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
}

function isString(value) {
  return typeof value === 'string';
}

// Wrapper factory

const wrap = (mod, options) => new Wrapped(mod, options);

// Static variables (for backwards compatibility)

let latest;

// Public interface for the module

module.exports = {
  // reusable wrap method
  wrap,

  // static init/run interface for backwards compatibility
  init: (mod, options) => {
    latest = wrap(mod, options);
  },
  run: (event, context, callback) =>
    new Promise((resolve, reject) => {
      let callbackFunction = callback;
      let contextObject = context;
      if (typeof context === 'function') {
        // backwards compatibility
        callbackFunction = context;
        contextObject = {};
      }
      if (typeof latest === typeof undefined) {
        const error = 'Module not initialized';
        reject(error);
        return callbackFunction(error, null);
      }

      if (latest.options && latest.options.InvocationType === 'Event') {
        return latest.run(event, contextObject);
      }

      return latest.run(event, contextObject, (err, data) => {
        if (callbackFunction) {
          return callbackFunction(err, data);
        }
        if (err) {
          return reject(err);
        }
        return resolve(data);
      });
    })
};
