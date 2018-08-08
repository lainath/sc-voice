# sc-voice

SuttaCentral voice assistance for vision-impaired. Includes:

* Javascript API for [IBM Watson Text-to-Speech API](https://www.ibm.com/watson/services/text-to-speech/)
* Javascript utilites for parsing SuttaCentral Pootl translations

### Directory structure

**local** contains local content not archived in git

### Watson
The [IBM Watson Text-to-Speech API](https://www.ibm.com/watson/services/text-to-speech/)
is used to convert sutta text to speech. To use Watson, you will need an IBM Cloud Watson account.

### Installation
With a Linux console:

```
git clone git@github.com:sc-karl/js-pootl.git
cd js-pootl
./scripts/init.sh
```

To enable Watson translation, first copy your Watson JSON credentials, then
do the following:

1. `cat > local/watson-credentials.json`
1. _paste credentials_
1. ENTER
1. CTRL-D

