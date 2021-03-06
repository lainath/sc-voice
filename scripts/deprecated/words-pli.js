#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
    PoParser,
    Segments,
    Words,
} = require('../index');

var SC = process.argv[2] || path.join(__dirname, '../local/sc/mn');
console.error(`scanning Pootle files in:${SC}`);

var parser = new PoParser();

var words = new Words;
var opts = { 
    words,
};
function emitWords(text) {
    words.tokenize(text).forEach(token => {
        words.isWord(token) && console.log(token.toLowerCase());
    });
    
}

(async function() { try {
    var files = await parser.files({
        root: path.join(__dirname, '../local/sc/mn'),
    });
    files.forEach(file => {
        (async function() { try {
            var segDoc = await parser.parse(file, opts);
            segDoc.segments.forEach((seg,i) => {
                emitWords(seg.pli);
            });
        } catch(e) {
            console.log(e.stack);
        }})();
    });
} catch(e) {
    console.log(e.stack);
} })();





