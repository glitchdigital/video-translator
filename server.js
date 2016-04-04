var watson = require('watson-developer-cloud'),
    fs = require('fs'),
    exec = require("child_process").exec,
    fs = require('fs'),
    uuid = require('node-uuid'),
    crypto = require('crypto'),
    util = require("util"),
    express = require("express"),
    app = express(),
    server = require('http').Server(app),
    io = require('socket.io')(server),
    siofu = require("socketio-file-upload"),
    path = require('path'),
    mkdirp = require('mkdirp'),
    colors = require('colors/safe'),
    sha1 = require('sha1'),
    languages = require('language-list')();

/**
 * Set and check configuration options before starting up
 */
    
// @TODO Check ffmpeg and ffprobe binaries found
var FFmpeg = process.env.FFMPEG || "ffmpeg";
var FFprobe = process.env.FFPROBE || "ffprobe";
var mediaDir = __dirname+'/media';
var tmpDir = "/tmp";

// Fetched on demand from IBM Watson API
var speechToTextOptions = null;
var textToSpeechOptions = null;

/**
 * Check API details configured
 */
if (!process.env.SPEECH_TO_TEXT_API_USERNAME || !process.env.SPEECH_TO_TEXT_API_PASSWORD ||
    !process.env.TRANSLATION_API_USERNAME || !process.env.TRANSLATION_API_PASSWORD ||
    !process.env.SPEECH_TO_TEXT_API_USERNAME || !process.env.SPEECH_TO_TEXT_API_USERNAME) {
  
  console.error(colors.bgRed.white("Required configuration options missing!\n"));

  if (!process.env.SPEECH_TO_TEXT_API_USERNAME || !process.env.SPEECH_TO_TEXT_API_PASSWORD)
    console.error(colors.red("SPEECH_TO_TEXT_API_USERNAME and SPEECH_TO_TEXT_API_PASSWORD must be configured"));

  if (!process.env.TRANSLATION_API_USERNAME || !process.env.TRANSLATION_API_PASSWORD)
    console.error(colors.red("TRANSLATION_API_USERNAME and TRANSLATION_API_PASSWORD must be configured"));

  if (!process.env.TEXT_TO_SPEECH_API_USERNAME || !process.env.TEXT_TO_SPEECH_API_PASSWORD)
    console.error(colors.red("TEXT_TO_SPEECH_API_USERNAME and TEXT_TO_SPEECH_API_PASSWORD must be configured"));

  console.error("\nEdit 'init.sh' to set configuration options");
    
  process.exit(1);
}

/**
 * Check media directory exists and is writeable
 */
try {
  mkdirp.sync(mediaDir, {mode: 0755});
} catch (e) {
  console.error(colors.bgRed.white('Unable to create directory %s'), mediaDir);
  process.exit(1);
}
try {
  fs.accessSync(mediaDir, fs.W_OK);
} catch (e) {
  console.error(colors.bgRed.white('Don\'t have permission to write to directory %s'), mediaDir);
  process.exit(1);
}

var speech_to_text = watson.speech_to_text({
  "url": "https://stream.watsonplatform.net/speech-to-text/api",
  "username": process.env.SPEECH_TO_TEXT_API_USERNAME,
  "password": process.env.SPEECH_TO_TEXT_API_PASSWORD,
  "version": 'v1'
});

var language_translation = watson.language_translation({
  "username": process.env.TRANSLATION_API_USERNAME,
  "password": process.env.TRANSLATION_API_PASSWORD,
  version: 'v2'
});

var text_to_speech = watson.text_to_speech({
  "url": "https://stream.watsonplatform.net/text-to-speech/api",
  "username": process.env.TEXT_TO_SPEECH_API_USERNAME,
  "password": process.env.TEXT_TO_SPEECH_API_PASSWORD,
  "version": 'v1'
});

/**
 * socket.io uploader
 */
app.use(siofu.router);

/**
 * Configure Express
 */
app.use(express.static(__dirname + '/public'));
app.use('/media', express.static(__dirname + '/media'));

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/public/index.html');
});

/**
 * 500 Error Handler
 */
app.use(function (err, req, res, next) {
  // Handle 404s
  if (err.message
    && (~err.message.indexOf('not found')
    || (~err.message.indexOf('Cast to ObjectId failed')))) {
    return next();
  };
  console.error(err);
  if (err.stack) console.error(err.stack);
  res.status(500).json({error: 500, message: err.message });
});

/**
 * 404 File Not Found Handler
 */
app.use(function(req, res, next) {
  res.status(404).json({error: 400, message: "File not found", requestedUrl: req.originalUrl });
});

io.on("connection", function(socket) {
  var uploader = new siofu();
  uploader.dir = tmpDir;
  uploader.listen(socket);
  var speechToTextModel = 'en-US_BroadbandModel';
  
  
  uploader.on("saved", function(event) {
    if (event.file.success) {
      // We rename the file and move it to the uploads direct with a name that
      // is both random (hard to guess) and safe (contains no escape chars).
      
      // Only allow file extentions with letters and numbers 
      var fileExtension = path.extname(event.file.pathName).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';

      // Assign new name, preserving existing file extension
      var newFileID = uuid.v4();
      var newDirectory =  mediaDir+getDirPathFromID(newFileID);
      var newFile = newFileID+'.'+fileExtension;

      // Create directory
      try {
        mkdirp.sync(newDirectory, {mode: 0755});
      } catch (e) {
        console.error(colors.bgRed.white('Unable to create directory %s'), mediaDir);
        process.exit(1);
      }

      fs.rename(event.file.pathName, newDirectory+'/'+newFile, function (err) {
        if (err) {
          socket.emit('file_error', { message: 'Error handling file after upload' });
          return console.error(err);
        }

        // Start transcribing the file right away
        transcribe(newDirectory+'/'+newFile, speechToTextModel, socket);
        
        // Fire back the path the client should use to play back the uploaded file
        socket.emit('file_ready', { pathToFile: '/media/'+getDirPathFromID(newFileID)+'/'+newFile });
      });
    }
  });

  socket.on("set_speech_to_text_options", function(event) {
    speechToTextModel = event.language;
  });
    
  socket.on("translate", function(event) {
    if (event.source == event.target) {
      return socket.emit('translation', {
        translations: [{ translation: event.text }],
        data: event.data
      });
    }
    
    language_translation.translate(
      { text: event.text, source: event.source, target: event.target },
      function (err, translation) {
        if (err) {
          socket.emit('translation_error', { error: err });
          return console.error('Error translating text:', err);
        }
        translation.data = event.data;
        socket.emit('translation',translation);
      });
  });

  socket.on("speech_to_text_options", function(event) {
    if (speechToTextOptions !== null)
      return socket.emit('speech_to_text_options',{ languages: speechToTextOptions });
    
    speechToTextOptions = {};
    speech_to_text.getModels(null, function(err, response) {
      response.models.forEach(function(model, index) {
        // Only expose 'Broadband' speech models (higher bit rate - narrow band is for telephony)
        if (model.name.indexOf('BroadbandModel') > -1) {
          var label = languages.getLanguageName(model.language.split('-')[0]);
          speechToTextOptions[model.name] = {
            label: label+' ('+model.language.split('-')[1]+')',
            language: model.language.split('-')[0]
          };
        }
      });
      speechToTextOptions = sortObject(speechToTextOptions);
      socket.emit('speech_to_text_options',{ languages: speechToTextOptions });
    });
  });

  socket.on("text_to_speech_options", function(event) {
    if (textToSpeechOptions !== null)
      return socket.emit('text_to_speech_options',{ voices: textToSpeechOptions });
    
    textToSpeechOptions = {};
    text_to_speech.voices(null, function(err, response) {
      response.voices.forEach(function(voice, index) {
        
        // IBM Translate doesn't support translating from English to German or Japanese
        if (voice.language == 'de-DE' || voice.language == 'ja-JP') return;
        
        var label = languages.getLanguageName(voice.language.split('-')[0])
                    +' ('+voice.description.split(":")[0]
                    +', '+voice.gender
                    +', '+voice.language.split('-')[1]+')';
        textToSpeechOptions[voice.name] = {
          label: label,
          language: voice.language.split('-')[0]
        };
      });
      textToSpeechOptions = sortObject(textToSpeechOptions);
      socket.emit('text_to_speech_options',{ voices: textToSpeechOptions });
    });
  });

  socket.on("synthesize", function(event) {
    var newFileID = uuid.v4();
    var newDirectory = mediaDir+getDirPathFromID(newFileID);
    var newFile = newFileID+'.wav';
    
    // Create directory
    try {
      mkdirp.sync(newDirectory, {mode: 0755});
    } catch (e) {
      console.error(colors.bgRed.white('Unable to create directory %s'), mediaDir);
      process.exit(1);
    }

    var params = {
      text: event.text,
      voice: event.voice,
      accept: 'audio/wav'
    };
    
    // Pipe the synthesized audio to a file 
    var writeableStream = fs.createWriteStream(newDirectory+'/'+newFile);
    writeableStream.on('finish', function() {
      socket.emit('synthesized', { audio: { src: '/media/'+getDirPathFromID(newFileID)+'/'+newFile }});
    })
    text_to_speech.synthesize(params).pipe(writeableStream);

  });
  
  socket.on("synthesize_script", function(event) {
    var script = event.script;
    var videoExtension = path.extname(event.video).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';
    var videoID = path.basename(event.video, '.'+videoExtension).replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();
    var videoDirectory = mediaDir+getDirPathFromID(videoID);
    var videoTmpDirectory = videoDirectory+'/tmp';
    
    // Sanitized path to video file (don't trust user input)
    var videoFile = videoDirectory+'/'+videoID+'.'+videoExtension;

    // Create directory
    try {
      mkdirp.sync(videoTmpDirectory, {mode: 0755});
    } catch (e) {
      console.error(colors.bgRed.white('Unable to create directory %s'), mediaDir);
      process.exit(1);
    }

    var audioFiles = [];
    var audioDuration = [];
    
    script.forEach(function(line, index) {
      var checksum = sha1(event.voice+line.text);
      var pathToScriptLineAudioFile = videoTmpDirectory+'/'+checksum+'.wav';
      
      // @TODO If audio file already generated and duration not null can skip generating it
      
      var params = {
        text: line.text,
        voice: event.voice,
        accept: 'audio/wav'
      };
      
      // Save the synthesized audio to a file 
      var writeableStream = fs.createWriteStream(pathToScriptLineAudioFile, {'flags': 'w+'});
      writeableStream.on('finish', function() {
        script[index].audio = { src: pathToScriptLineAudioFile };
        audioFiles.push(pathToScriptLineAudioFile);
        // Check if we have generated all audio files yet
        if (audioFiles.length == script.length) {
          // If we have, then parse the script and metadata to it
          // @TODO Optimize/merge this metadata generation step?
          addAudioMetadataToScript(script, socket, function(err, scriptWithMetadata) {
            // Once we have metadata, generate audio track
            joinScriptAudioFiles(scriptWithMetadata, videoTmpDirectory+"/audio-from-script-"+new Date().getTime()+".wav", socket, function(err, audioTrack) {
              addAudioTrack(videoFile, audioTrack, socket, function(err, videoUrl) {
                socket.emit("synthesized_script", { url: videoUrl });
              });
            });
          });
        }
      });
      text_to_speech.synthesize(params).pipe(writeableStream);
    });
  });

});

/**
 * Start listening
 */
app.set('port', process.env.PORT || 3000);
require('dns').lookup(require('os').hostname(), function(err, ipAddress, fam) {
  server.listen(app.get('port'), function() {
    console.log('Server running at http://%s:%d in %s mode', ipAddress, app.get('port'), app.get('env'));
  });
});


/** 
 * Takes an audio file, strips the audio and streams back a transcription over socket.io
 * @TODO Add back support audio live streams
 */
function transcribe(videoFile, speechToTextModel, socket) {
  var videoExtension = path.extname(videoFile).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';
  var videoID = path.basename(videoFile, '.'+videoExtension);
  var videoDirectory = mediaDir+getDirPathFromID(videoID);
  var audioFile = videoDirectory+"/origional-audio-"+new Date().getTime()+".wav";

  // Have FFmpeg strip out the audio and save it as a wav
  exec(FFmpeg+' -i "'+videoFile+'" "'+audioFile+'" -y', {
    encoding: "utf8",
    maxBuffer: 1024*1024
  },
  function(err, stdout, stderr) {
    if (err) {
      socket.emit('file_error', { message: 'Error processing file after upload' });
      return console.error(err);
    }

    if (!fs.statSync(audioFile)) {
      socket.emit('file_error', { message: 'Error extracting audio' });
      return console.error("Could not open audio file at "+audioFile);
    }
    
    socket.emit('transcription_start', { transcription: '' });

    var recognizeStream = speech_to_text.createRecognizeStream({
      content_type: 'audio/wav',
      interim_results: true,
      word_confidence: true,
      max_alternatives: 3,
      timestamps: true,
      inactivity_timeout: 600,
      model: speechToTextModel
    });

    fs.createReadStream(audioFile).pipe(recognizeStream);

    recognizeStream.setEncoding('utf8');

    // Streams are processed in 'segments' (blocks of text at a time).
    // Translations of words in a segment are constantly evaluated while the
    // segment is being processed.
    // At the end of a segment a confidence value for each word is returned.
    var transcript = [];
    var segmentCount = 0;
    var wordCount = 0;
    
    ['data', 'results', 'error', 'close'].forEach(function(eventName) {
     recognizeStream.on(eventName, function(eventData) {

       if (eventName == "error")
         socket.emit('transcription_error', { error: eventData });
      
       if (eventData.results && eventData.results[0].alternatives) {
         var data = eventData.results[0].alternatives[0];

         // If there there is a 'timestamps' property then update the word list
        if (data.timestamps) {
         data.timestamps.forEach(function(word, index) {
           transcript[wordCount+index] = {
             word: word[0],
             in: word[1],
             out: word[2],
             confidence: 0,
             segment: segmentCount,
           };
         });
        }
      
        // If there is a 'word_confidence' property then it's summary at the  
        // end of a segment (and the final translation of this segment).
        if (data.word_confidence) {
           // Final translation of all words in the segment with confidence values
           data.word_confidence.forEach(function(word, index) {
             transcript[wordCount+index].confidence = word[1];
           });
         
           // Bump the segment number
           segmentCount++;
         
           // wordCount is increased only at the end of every segement,
           // so that the next segment starts words from that point.
           wordCount += data.word_confidence.length;
         } 
       
         socket.emit('transcription_progress', { transcription: transcript })
       }
       
       if (eventName == "close")
         socket.emit('transcription_complete', { transcription: transcript })
     }); 
    });

  });
};

function addAudioMetadataToScript(script, socket, callback) {
  // Get the duration of each audio file and adds that metadata to the script
  var durations = [];
  script.forEach(function(line, index) {
    exec(FFprobe+' '+line.audio.src+' -show_entries format=duration -v quiet -of csv="p=0"',
    {
      encoding: "utf8",
      maxBuffer: 1024*1024
    },
    function(err, stdout, stderr) {
      if (err) {
        socket.emit('synthesize_script_error', { message: err });
        return console.error(err);
      }
      
      if (!line.in) {
        if (index == 0) {
          // If no time on first line, start at 0 seconds in
          script[0].in = 0;
        } else {
          // If no time on current line, start immediately after the previous line ends
          script[index].in = script[index].out;
        }
      }
        
      var duration = parseFloat(stdout.trim());
      script[index].duration = duration;
      script[index].out = parseFloat(line.in) + duration;
      durations.push(duration);
      if (durations.length == script.length) {
        callback(null, script);
      }
    });
  });
}

function joinScriptAudioFiles(script, outputFile, socket, callback) {
  // Join audio files
  var cmd = FFmpeg+' -nostats -f lavfi -i anullsrc';
  var inputArgs = '';
  var filterArgs = ' -filter_complex "';
  var concatArgs = '';
  var filterCount = 0;
  script.forEach(function(line, index) {
    inputArgs += " -i "+line.audio.src;
    if (index == 0 && line.in > 0) {
        // Add silence at start (until first audio segment)
        filterArgs += '[0:a]atrim=end='+line.in+',asetpts=PTS-STARTPTS[s0];';
        concatArgs += '[s0]';
        filterCount++;
        filterArgs += '[1:a]atrim=end='+line.duration+',asetpts=PTS-STARTPTS[a1];';
        concatArgs += '[a1]';
        filterCount++;
    } else {
      filterArgs += '['+(index+1)+':a]atrim=end='+line.duration+',asetpts=PTS-STARTPTS[a'+filterCount+'];';
      concatArgs += '[a'+filterCount+']';
      filterCount++;
    }
    // If there is a node after this one then add in silence until it
    if (script[index+1] && (line.out < script[index+1].in)) {
      var silence = script[index+1].in - line.out;
      filterArgs += '[0:a]atrim=end='+silence+',asetpts=PTS-STARTPTS[s'+filterCount+'];';
      concatArgs += '[s'+filterCount+']';
      filterCount++;
    }
  });
  filterArgs += concatArgs+'concat=n='+filterCount+':v=0:a=1[a]"';
  cmd += inputArgs + filterArgs + ' -map "[a]" -shortest '+outputFile;
  exec(cmd,
  {
    encoding: "utf8",
    maxBuffer: 1024*1024
  },
  function(err, stdout, stderr) {
    if (err) {
      socket.emit('synthesize_script_error', { message: err });
      return console.error(err);
    }
    // Return URL to download audio
    callback(null, outputFile);
  });

}

function addAudioTrack(videoFile, audioTrack, socket, callback) {
  var videoExtension = path.extname(videoFile).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4';
  var videoID = path.basename(videoFile, '.'+videoExtension);
  var videoDirectory = mediaDir+getDirPathFromID(videoID);

 var outputFile =  new Date().getTime()+'.'+videoExtension;
 var outputUrl = '/media'+getDirPathFromID(videoID)+'/'+outputFile;

  //cmd += inputArgs + filterArgs + ' -map "[a]" -shortest '+outputFile;
  exec(FFmpeg+' -nostats -i '+videoFile+' -i '+audioTrack+' -map 0:v -map 1:a '+videoDirectory+'/'+outputFile,
  {
    encoding: "utf8",
    maxBuffer: 1024*1024
  },
  function(err, stdout, stderr) {
    if (err) {
      socket.emit('synthesize_script_error', { message: err });
      return console.error(err);
    }
    // Return URL to download audio
    callback(null, outputUrl);
  });
}

function getDirPathFromID(id) {
  return '/'+id.substring(0,2)
        +'/'+id.substring(2,4)
        +'/'+id.substring(4,6)
        +'/'+id;
};

function sortObject(o) {
    return Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {});
}