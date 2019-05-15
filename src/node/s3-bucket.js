(function(exports) {
    const fs = require('fs');
    const path = require('path');
    const {
        logger,
    } = require('rest-bundle');
    const {
        exec,
    } = require('child_process');
    const {
        version,
    } = require('../../package');
    const AWS = require("aws-sdk");
    const tmp = require('tmp');
    const REGION = 'us-west-1';
    const BUCKET = 'sc-voice-bucket';
    const LOCAL = path.join(__dirname, '..', '..', 'local');
    const DEFAULT_OPTS = {
        s3: {
            apiVersion: '2006-03-01',
            endpoint: 's3.us-west-1.amazonaws.com',
            region: 'us-west-1',
        }
    }

    class S3Bucket {
        constructor(opts = DEFAULT_OPTS) {
            this.Bucket = opts.Bucket || BUCKET;
            var s3 = this.s3 = opts.s3 instanceof AWS.S3 
                ? opts.s3
                : new AWS.S3(opts.s3);

            this.initialized = false;
            this.LocationConstraint = opts.LocationConstraint || REGION;
        }

        initialize() {
            var {
                Bucket,
                LocationConstraint,
                s3,
            } = this;
            if (this.initialized) {
                return Promise.resolve(this);
            }
            var that = this;
            return new Promise((resolve, reject) => {
                (async function() { try {
                    s3.listBuckets(function(err, data) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        if (data.Buckets.some(b=>b.Name === Bucket)) {
                            logger.info(`S3Bucket.initialize() found bucket:${Bucket}`);
                            that.initialized = true;
                            resolve(that);
                        } else {
                            logger.info(`S3Bucket.initialize() creating bucket:${Bucket}`);
                            that.createBucket().then(bucketData => {
                                that.initialized = true;
                                resolve(that);
                            });
                        }
                    });
                } catch(e) {reject(e);} })();
            });
        }

        createBucket() {
            var {
                Bucket,
                LocationConstraint,
                s3,
            } = this;
            var that = this;
            return new Promise((resolve, reject) => {
                (async function() { try {
                    var params = {
                        Bucket,
                        CreateBucketConfiguration: {
                            LocationConstraint,
                        },
                    };
                    s3.createBucket(params, function(err, data) {
                        if (err) {
                            reject(err);
                            return;
                        }
                        logger.warn(`createBucket() location:${data.Location}`);
                        resolve(data);
                    });
                } catch(e) {reject(e);} })();
            });
        }

        putObject(Key, data) {
            var {
                s3,
                Bucket,
            } = this;
            var that = this;
            return new Promise((resolve, reject) => {
                (async function() { try {
                    var params = {
                        Body: data,
                        Bucket,
                        Key,
                    };
                    s3.putObject(params, (err, response) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve({
                            s3Bucket: {
                                Bucket,
                                s3: {
                                    endpoint: s3.config.endpoint,
                                    region: s3.config.region,
                                },
                            },
                            Key,
                            response,
                        });
                    });
                } catch(e) {reject(e);} })();
            });
        }

        getObject(oname) {
            var {
                s3,
                Bucket,
            } = this;
            return new Promise((resolve, reject) => {
                (async function() { try {
                    var params = {
                        Bucket,
                        Key: oname,
                    };

                    s3.getObject(params, (err, data) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve(data);
                    });
                } catch(e) {reject(e);} })();
            });
        }

        getObjectStream(oname) {
            var {
                s3,
                Bucket,
            } = this;
            return new Promise((resolve, reject) => {
                (async function() { try {
                    var params = {
                        Bucket,
                        Key: oname,
                    };

                    var stream = s3.getObject(params).createReadStream();
                    resolve(stream);
                } catch(e) {reject(e);} })();
            });
        }
    }

    module.exports = exports.S3Bucket = S3Bucket;
})(typeof exports === "object" ? exports : (exports = {}));

