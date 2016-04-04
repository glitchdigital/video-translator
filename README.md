# Computer Assisted Video Translation

This is a prototype web based tool for computer assisted video translation. It provides an interface for doing computer assisted transcription and translation and generates a new video with a synthesized voice speaking in the selected langauge.

The goal is to show how translating videos could be easier, quicker and done more cost effectively with better tools.

![screenshot](https://raw.githubusercontent.com/glitchdigital/video-translator/master/screenshot.png)

If you'd like to see what it looks like in use without having to install it and set it up, see the [glitch.digital YouTube channel](https://www.youtube.com/channel/UCQbi0PPu5bObs3_OCiWUs8Q) for videos of it in action.

### About this prototype

This prototype is not intended to be something for journalists to be ready to download and use in production. It requires some setup and currently runs only on Unix systems (e.g. Mac, Linux - not Microsoft Windows). Due a limitation of the translation API used in this prototype it does not support direct translation between all language combinations.

It is built on top of the [Computer Assisted Transcription Tool](https://github.com/glitchdigital/video-transcriber) glitch.digital released last month and, like that prototype, also used the IBM Bluemix APIs.

If you are a journalist or work for a news or media organisation you'd like a demo of this set up for you to try out get in touch with <enquiries@glitch.digital>.

# Getting started

You will need node.js and ffmpeg installed to run this software.

You will also need to sign up for an IBM Bluemix account and obtain usernames and passwords for the following APIs:

* https://console.ng.bluemix.net/catalog/services/speech-to-text
* https://console.ng.bluemix.net/catalog/services/text-to-speech
* https://console.ng.bluemix.net/catalog/services/language-translation

## Installing

To install required libraries, use npm install:

    npm install

## Running

You will need to specify your username and password for the the IBM Bluemix APIs.

Edit the `init.sh` script to specify these and other options.

Start the application with npm start:

    npm start

If you don't get any errors you should be able to go to http://localhost:3000 in your browser and start transcribing videos.

# Credits 

This protoype software is provided free of charge under and released under the MIT Licence by glitch.digital.

glitch.digital provides data journalism, digital storytelling and interactive journalism services as well as tools and datasets for journalists, newsrooms and the wider media industry.

See http://glitch.digital for more details.
