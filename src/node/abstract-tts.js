(function(exports) {
    const fs = require('fs');
    const path = require('path');
    const Queue = require('promise-queue');
    const { MerkleJson } = require('merkle-json');
    const {
        logger,
    } = require('rest-bundle');
    const GuidStore = require('./guid-store');
    const Words = require('./words');
    const ABSTRACT_METHOD = "abstract method must be overridden and implemented by base class";
    const { exec } = require('child_process');
    const RE_PARA = new RegExp(`^[${Words.U_RSQUOTE}${Words.U_RDQUOTE}]*\n$`,'u');
    const RE_PARA_EOL = /^\n\n+$/u;

    class AbstractTTS {
        constructor(opts={}) {
            this.language = opts.language || 'en';
            this.languageUnknown = opts.languageUnknown || this.language;
            this.hits = 0;
            this.misses = 0;
            this.voice = null;
            this.api = opts.api || null;
            this.stripNumbers = opts.stripNumbers;
            this.stripQuotes = opts.stripQuotes;
            this.apiVersion = opts.apiVersion || null;
            this.audioSuffix = opts.audioSuffix || ".ogg";
            this.queue = new Queue(opts.maxConcurrentServiceCalls || 5, Infinity);
            this.usage = opts.usage || "recite";
            this.maxSSML = opts.maxSSML || 5000;
            this.usages = opts.usages || {};
            this.mj = new MerkleJson({
                hashTag: 'guid',
            });
            this.store = opts.store || new GuidStore({
                type: 'SoundStore',
                storeName: 'sounds',
            });
            Object.defineProperty(this, 'credentials', {
                writable: true,
            });
            var words = opts.words || null;
            if (words instanceof Words) {
                // provided
            } else {
                words = new Words(words, {
                    language: this.language,
                });
                logger.info(`${this.constructor.name}() `+
                    `default words:${Object.keys(words.words).length}`);
            }
            Object.defineProperty(this, 'words', {
                value: words,
            });
            this.audioFormat = opts.audioFormat || 'audio/ogg';
            this.prosody = opts.prosody || {
                rate: "-10%",
            };
            var usage = this.usages[this.usage] || {};
            this.breaks = opts.breaks || usage.breaks || [0.001,0.1,0.2,0.6,1];
            this.reNumber = /^[-+]?[0-9]+(\.[0-9]+)?$/;
            var vowels = this.words._ipa.vowels || "aeiou";
            this.reVowels1 = new RegExp(`^[${vowels}].*`, 'u');
        }

        get ERROR_SIZE() { return 500 }

        get username() {
            return this.credentials && this.credentials.username;
        }

        get password() {
            return this.credentials && this.credentials.password;
        }

        set username(value) {
            this.credentials == null && (this.credentials = {});
            this.credentials.username = value;
            return value;
        }

        set password(value) {
            this.credentials == null && (this.credentials = {});
            this.credentials.password = value;
            return value;
        }

        isNumber(text) {
            return !!text.match(this.reNumber);
        }

        break(index) {
            var t = this.breaks[index] || this.breaks[this.breaks.length-1];
            return `<break time="${t}s"/>`;
        }

        wordInfo(word) {
            word = word && word.toLowerCase();
            var wordValue = word && this.words.words[word];
            if (wordValue && typeof wordValue === 'string') { // synonym
                wordValue = this.wordInfo(wordValue);
            }
            return wordValue || null;
        }

        ipa_word(ipa, word) {
            var ssml = `<phoneme alphabet="ipa" ph="${ipa}">${word}</phoneme>` +
                this.break(0);
            if (ipa.match(this.reVowels1)) {
                ssml = this.break(0)+ssml;
            }

            return ssml;
        }

        wordSSML(word) {
            var wordInfo = this.wordInfo(word);
            if (wordInfo) {
                if (wordInfo.ipa) { // use custom IPA
                    var ipa = wordInfo.ipa;
                } else if (wordInfo.language !== this.language.split('-')[0]) { // generate IPA
                    var ipa = this.words.ipa(word, wordInfo.language); 
                } else {
                    var ipa = null;
                }
            } else { // unknown word or punctuation
                if (Words.RE_ACRONYM.test(word)) {
                    return word
                        .replace('{', '<say-as interpret-as="spell">')
                        .replace('}', '</say-as>');
                } else if (this.words.isWord(word)) {
                    var w = word.endsWith(`’`) ? word.substring(0,word.length-1) : word;
                    if (this.languageUnknown !== this.language && 
                        this.words.isForeignWord(w)) { 
                        var ipa = this.words.ipa(word, this.languageUnknown); 
                    } else {
                        var ipa = null;
                    }
                } else if (word.endsWith(`’`)) {
                    var ipa = null; 
                } else {
                    var ipa = null; 
                }
            }
            if (ipa) {
                if (ipa.endsWith('(.)')) {
                    var pauses = ipa.split('(.)');
                    ipa = pauses.map(x => {
                        return this.ipa_word(x, word);
                    }).join(this.break(1));
                    return ipa;
                } else {
                    return this.ipa_word(ipa, word);
                }
            }
            return word;
        }

        tokenize(text) {
            return this.words.tokenize(text);
        }

        tokensSSML(text) {
            if (this.stripNumbers) {
                text = text.replace(/[0-9.]+/ug,' ');
            }
            if (this.stripQuotes) {
                text = text.replace(/[„“‟‘‛'’"”»«]+/ug,' ');
            }
            var tokens = text instanceof Array ? text : this.tokenize(text);
            var tokensSSML = tokens.reduce((acc, token) => {
                if (RE_PARA_EOL.test(token)) {
                    acc.length && acc.push('\n');
                    acc.push(`${this.break(5)}`);
                    acc.push('\n');
                } else if (token === '&') {
                    acc.push('&amp;');
                } else {
                    acc.push(this.wordSSML(token) || token);
                }
                return acc;
            }, []);
            return tokensSSML;
        }

        segment(tokens) {
            var symbols = this.words.symbols;
            var acc = tokens.reduce((acc,token) => {
                var symbol = symbols[token];
                if (token.length === 1 && !this.words.isWord(token) && !this.isNumber(token)) {
                    if (symbol == null) {
                        throw new Error(`undefined symbol: ${token}`);
                    }
                    acc.cuddle = symbol.cuddle;
                    if (acc.cuddle === 'left') {
                        acc.segment = acc.segment + token;
                    } else if (symbol.eol) {
                        if (acc.segment) {
                            acc.segments.push(acc.segment + token);
                        } else if (acc.segments) {
                            acc.segments[acc.segments.length-1] += token;
                        }
                        acc.segment = '';
                    } else {
                        acc.segment = acc.segment ? acc.segment + ' ' + token : token;
                    }
                    if (symbols[token].endSegment) {
                        acc.segments.push(acc.segment);
                        acc.segment = '';
                    }
                } else {
                    if (symbol && symbol.cuddle === 'left') {
                        acc.segment = acc.segment + token;
                    } else if (acc.cuddle === 'right') {
                        acc.segment = acc.segment + token;
                    } else {
                        acc.segment = acc.segment ? acc.segment + ' ' + token : token;
                    }
                    acc.cuddle = null;
                }
                acc.prevToken = token;
                return acc;
            }, {
                segments: [],
                segment: '',
                cuddle: null,
                prevToken: null,
            });
            acc.segment && acc.segments.push(acc.segment);
            return acc.segments;
        }

        segmentSSML(text) {
            var tokens = this.tokensSSML(text);
            return this.segment(tokens);
        }

        signature(text) {
            var signature = {
                api: this.api,
                apiVersion: this.apiVersion,
                audioFormat: this.audioFormat,
                voice: this.voice,
                prosody: this.prosody,
                language: this.language,
                text,
            };
            signature[this.mj.hashTag] = this.mj.hash(signature);
            return signature;
        }
        
        synthesizeResponse(resolve, reject, request) {
            var hitPct = (100*this.hits/(this.hits+this.misses)).toFixed(1);
            var outpath = request.outpath;
            var stats = fs.existsSync(outpath) && fs.statSync(outpath);
            if (stats && stats.size <= this.ERROR_SIZE) {
                var err = fs.readFileSync(outpath).toString();
                reject(new Error(`sound file is too short (${stats.size}): ${outpath} ${this.audioFormat} ${this.audioSuffix}`));
                //reject(new Error(`sound file is too short (${stats.size}): ${outpath} ${err}`));
            }
            resolve(this.createResponse(request, false));
        }

        createResponse(request, cached = false) {
            var signature = request.signature;
            var jsonPath = this.store.signaturePath(signature, ".json");
            fs.writeFileSync(jsonPath, JSON.stringify(signature, null, 2)+'\n');
            var response = {
                file: request.outpath,
                hits: this.hits,
                misses: this.misses,
                signature,
                cached: false,
            };
            return response;
        }

        synthesizeSSML(ssmlFragment, opts={}) {
            var that = this;
            if (ssmlFragment.length > this.maxSSML) {
                var oldLen = ssmlFragment.length;
                ssmlFragment = ssmlFragment.replace(/>[^<]+<\/phoneme/iug, '/');
                logger.info(`AbstractTts.synthesizeSSML() shrinking large SSML (1) `+
                    `before:${oldLen} `+
                    `after:${ssmlFragment.length} `+
                    `ssml:${ssmlFragment.substring(0, 500)}...`);
                if (ssmlFragment.length > this.maxSSML) {
                    ssmlFragment = ssmlFragment.replace(/<break[^>]+>/iug, '');
                    logger.info(`AbstractTts.synthesizeSSML() shrinking large SSML (2) `+
                        `before:${oldLen} `+
                        `after:${ssmlFragment.length} `);
                } 
            }
            return new Promise((resolve, reject) => {
                try {
                    var cache = opts.cache == null ? true : opts.cache;
                    var rate = this.prosody.rate || "0%";
                    var pitch = this.prosody.pitch || "0%";
                    var ssml = `<prosody rate="${rate}" pitch="${pitch}">${ssmlFragment}</prosody>`;
                    var signature = this.signature(ssml);
                    var outpath = this.store.signaturePath(signature, this.audioSuffix);
                    var request = {
                        ssml,
                        signature,
                        outpath,
                    };

                    var stats = fs.existsSync(outpath) && fs.statSync(outpath);
                    if (cache && stats && stats.size > this.ERROR_SIZE) {
                        this.hits++;
                        resolve(this.createResponse(request, true));
                    } else {
                        that.misses++;

                        that.serviceSynthesize(resolve, e => {
                            if (/EAI_AGAIN/.test(e.message)) {
                                logger.warn(`synthesizeSSML() ${e.message} (retrying...)`);
                                that.serviceSynthesize(resolve, e => {
                                    logger.warn(`synthesizeSSML() ${e.message} `+
                                        `ssml:${ssmlFragment.length}utf16 ${ssmlFragment}`);
                                    reject(e);
                                }, request);
                            } else {
                                logger.warn(`synthesizeSSML() ${e.message} `+
                                    `ssml:${ssmlFragment.length}utf16 ${ssmlFragment}`);
                                reject(e);
                            }
                        }, request);
                    }
                } catch (e) {
                    logger.warn(`synthesizeSSML() ${e.message} ssml:${ssmlFragment}`);
                    reject(e);
                }
            });
        }

        stripHtml(text) {
            text = text.replace(/<[^>]*>/ug, '');
            return text;
        }

        synthesizeText(text, opts={}) {
            var that = this;
            return new Promise((resolve, reject) => {
                var queue = that.queue;
                (async function() { try {
                    var result = null;
                    var ssmlAll = [];
                    if (typeof text === 'string') {
                        var segments = that.segmentSSML(that.stripHtml(text));
                        var promises = segments.map(ssml => {
                            ssmlAll.push(ssml);
                            return queue.add(() => that.synthesizeSSML(ssml, opts));
                        });
                        result = await Promise.all(promises);
                    } else if (text instanceof Array) {
                        var textArray = text;
                        var segments = [];
                        //var promises = textArray.map(t => that.synthesizeText(t, opts));
                        var promises = textArray.reduce((acc, t) => {
                            var segs = that.segmentSSML(that.stripHtml(t));
                            segs.forEach(ssml => {
                                ssmlAll.push(ssml);
                                acc.push(queue.add(() => that.synthesizeSSML(ssml, opts)));
                            });
                            segments.push(segs);
                            return acc;
                        }, []);
                        result = await Promise.all(promises);
                    }
                    if (result) {
                        if (result.length === 1) {
                            result = result[0];
                        } else {
                            var files = result.map(r => r.file);
                            result = await that.ffmpegConcat(files, {
                                ssmlAll,
                            });
                        }
                        resolve(Object.assign({
                            segments,
                        }, result));
                    } else {
                        reject(new Error("synthesizeText(text?) expected string or Array"));
                    }
                } catch(e) { reject(e);} })();
            });
        }

        serviceSynthesize(resolve, reject, request) {
            reject (new Error(ABSTRACT_METHOD));
        }

        ffmpegConcat(files, opts = {}) {
            return new Promise((resolve, reject) => {
                var inputs = `file '${files.join("'\nfile '")}'\n`;
                var signature = {
                    api: "ffmegConcat",
                    files,
                }
                signature[this.mj.hashTag] = this.mj.hash(signature);
                var outpath = this.store.signaturePath(signature, this.audioSuffix);
                var stats = fs.existsSync(outpath) && fs.statSync(outpath);
                var cache = opts.cache == null ? true : opts.cache;
                var request = {
                    signature,
                    outpath,
                    files,
                };
                if (cache && stats && stats.size > this.ERROR_SIZE) {
                    this.hits++;
                    resolve(this.createResponse(request, true));
                } else {
                    if (opts.ssmlAll) {
                        var ssmlPath = this.store.signaturePath(signature, ".ssml");
                        fs.writeFileSync(ssmlPath, JSON.stringify(opts.ssmlAll, null, 2));
                    }
                    var inpath = this.store.signaturePath(signature, ".txt");
                    fs.writeFileSync(inpath, inputs);
                    var cmd = `bash -c "ffmpeg -y -safe 0 -f concat -i ${inpath} -c copy ${outpath}"`;
                    var execOpts = {
                        maxBuffer: 500*1024,
                    };
                    exec(cmd, execOpts, (err, stdout, stderr) => {
                        if (err) {
                            console.error(err.stack);
                            reject(err);
                            return;
                        }

                        var stats = fs.existsSync(outpath) && fs.statSync(outpath);
                        if (stats && stats.size <= this.ERROR_SIZE) {
                            var err = fs.readFileSync(outpath).toString();
                            console.error(`ffmpegConcat() failed ${outpath}`, stats.size, err);
                            reject(new Error(err));
                        } else {
                            resolve(this.createResponse(request, false));
                        }
                    });
                }
            });

        }

    }

    module.exports = exports.AbstractTTS = AbstractTTS;
})(typeof exports === "object" ? exports : (exports = {}));

