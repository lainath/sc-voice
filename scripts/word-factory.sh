#!/bin/bash

DIR=`dirname $0`
DIR=`realpath $DIR`

#if [ ! -e $DIR/../local/words-all.txt ]; then
    $DIR/words-en.js $DIR/../local/sc \
    | sort -f \
    | uniq -i \
    > $DIR/../local/words-all.txt
#fi

#if [ ! -e $DIR/../local/words-spell.txt ]; then
    cat $DIR/../local/words-all.txt \
    | aspell -p $DIR/../words/aspell.en.pws -a \
    | cut -d ' ' -f 2 \
    | grep -v '*' \
    | sed -e "/^$/d" \
    | tee $DIR/../local/words-spell.txt
#fi

#if [ ! -e $DIR/../local/words-pali.txt ]; then
    #grep -v `printf '^[a-zA-Z\u2019]*$'` \
    #< $DIR/../local/words-all.txt \
    #> $DIR/../local/words-pali.txt
#fi

#if [ ! -e $DIR/../local/words-romanize.json ]; then
    #$DIR/romanize.js \
    #< $DIR/../local/words-pali.txt \
    #> $DIR/../local/words-romanize.json
#fi
