var socket = io.connect();
var uploadProgress = 0;
var uploader = new SocketIOFileUpload(socket);
var transcribedParagraphs = 0;
var voiceOptions = null;
var transcriptionOptions = null;

socket.on('transcription_start', function(event) {
  document.getElementById("status").innerHTML = '<i class="fa fa-circle-o-notch fa-spin"></i> Transcribing...';
  document.getElementById("transcription").removeAttribute('contentEditable');
  document.getElementById("translation").removeAttribute('contentEditable');
  document.getElementById("transcription").innerHTML = '';
  document.getElementById("transcription-preview").innerHTML = '';
  document.getElementById("transcription-preview").style.display = 'block';
  document.getElementById("translation").innerHTML = '';
  document.getElementById("transcription-in-progress").style.display = 'block';  
  document.getElementById("translation-in-progress").style.display = 'block';
  document.getElementById("video-input").oncanplaythrough = function() {
    document.getElementById("video-input").play();
  };
  document.getElementById("video-output-placeholder").innerHTML = 'Waiting for translation…';
  transcribedParagraphs = 0;
});

socket.on('transcription_progress', function(event) {
  var transcriptionHtml = parseTranscriptionIntoHtml(event.transcription);

  // insert last transcribed paragraph into the preview window
  document.getElementById("transcription-preview").innerHTML = transcriptionHtml[transcriptionHtml.length - 1];
  // remove last transcribed paragraph (only write add transcriptions to script)
  transcriptionHtml.pop();
    
  if (transcriptionHtml.length > 0) {
    var transcription = document.getElementById("transcription");
    // Write all transcribed paragraphs to on screen script and translate them
    while (transcribedParagraphs < transcriptionHtml.length) {
      transcription.innerHTML += transcriptionHtml[transcribedParagraphs];
      translateParagraph(transcribedParagraphs);
      transcribedParagraphs++;
    };
  }
});

socket.on('transcription_error', function(event) {
  document.getElementById('transcription').innerHTML = "<p><strong>Transcription unavailable</strong> An error occurred with the transcription service.</p>"
});

socket.on('transcription_complete', function(event) {
  document.getElementById("status").innerHTML = "Transcribing complete";
  document.getElementById("transcription-in-progress").style.display = 'none';
  var transcriptionHtml = parseTranscriptionIntoHtml(event.transcription);
  document.getElementById("transcription-preview").innerHTML = '';
  if (transcriptionHtml.length > 0) {
    var transcription = document.getElementById("transcription");
    var lastParagraphTanslated = transcribedParagraphs;
    // Write all remaining paragraphs to the on screen script
    while (transcribedParagraphs < transcriptionHtml.length) {
      transcription.innerHTML += transcriptionHtml[transcribedParagraphs];
      translateParagraph(transcribedParagraphs);
      transcribedParagraphs++;
    }
  }
  document.getElementById("transcription").setAttribute('contentEditable', true);
  setTimeout(function() {
    document.getElementById("transcription-in-progress").style.display = 'none';
    if (document.getElementById("status").innerHTML == "Transcribing complete")
      document.getElementById("status").innerHTML = "";
  }, 1000);
});

uploader.addEventListener("error", function(event) {
  document.getElementById("status").innerHTML = "Error uploading: "+event.message;
});

socket.addEventListener("file_error", function(event) {
  document.getElementById("status").innerHTML = '<i class="fa fa-fw fa-exclamation-triangle"></i> '+event.message;
});

socket.addEventListener("file_ready", function(event) {
  document.getElementById("video-input").src = event.pathToFile;
  document.getElementById("video-input").style.display = "block";
});

uploader.addEventListener("start", function(event) {
  document.getElementById("uploader").style.display = 'none';
  document.getElementById("status").innerHTML = "Uploading...";
  uploadProgress = 0;
  document.getElementById("upload-progress").style.display = 'block';
});

uploader.addEventListener("progress", function(event) {
  var p = (event.bytesLoaded / event.file.size);
  if (p != 1) {
    if (Math.round(p * 100) > uploadProgress) {
      uploadProgress = Math.round(p * 100);
      document.getElementById("status").innerHTML = "Upload "+uploadProgress+"% complete";
      document.getElementById("upload-percent-complete").style.width = uploadProgress+'%';
    }
  }
});

uploader.addEventListener("complete", function(event) {
  uploadProgress = 100;
  document.getElementById("upload-progress").style.display = 'none';
  setTimeout(function() {
    document.getElementById("upload-percent-complete").style.width = '0%';
  }, 1000);
});

uploader.listenOnInput(document.getElementById("siofu_input"));

document.onmousedown = function(event) {
  var transcription = document.querySelector('#transcription');
  var translation = document.querySelector('#translation');
  if (transcription.contains(event.target)) {
    if (event.target.getAttribute('data-in')) {
      event.target.className = "";
      document.getElementById("video-input").currentTime = event.target.getAttribute('data-in');
      document.getElementById("video-output").pause();
      document.getElementById("video-input").play();
    }
    if (event.target.nodeName != "P" && event.target.style) {
      event.target.style.color = "inherit";
      event.target.style.backgroundColor = "inherit";
    }
  }
  if (translation.contains(event.target)) {
    if (event.target.getAttribute('data-in')) {
      event.target.className = "";
      document.getElementById("video-output").currentTime = event.target.getAttribute('data-in');
      document.getElementById("video-input").pause();
      document.getElementById("video-output").play();
    }
    if (event.target.nodeName != "P" && event.target.style) {
      event.target.style.color = "inherit";
      event.target.style.backgroundColor = "inherit";
    }
  }

}

function updateTranslation() {
  document.getElementById("video-output").pause();
  document.getElementById("translation").removeAttribute('contentEditable');
  document.getElementById("translation").innerHTML = '';
  document.getElementById("translation-in-progress").style.display = 'block';
  document.getElementById("update-translation").style.display = 'none';
  document.getElementById("update-output").style.display = 'none';
  translateParagraph(0, true);
}

function parseTranscriptionIntoHtml(transcript) {
  var newSentanceThreshold = 0.5; // Pauses longer than this are a new sentance
  var newSentenceCharacterThreshold = 5000; // More characters than this are a new sentance
  var paragraphCount = 0;
  var paragraphHtml = '';
  var paragraphHtmlArray = [];
  var transcription = document.getElementById('transcription');

  transcript.forEach(function(w, index) {

    var word = w.word;
    
    if (word == '%HESITATION') word = "…";
    
    // Capitalise first letter of word if it's
    // (a) the first word in the transcript
    // (b) the first word in a new sentence
    if (index == 0 || (transcript[index-1].out + newSentanceThreshold) < w.in || (paragraphHtml.length >= newSentenceCharacterThreshold)) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
      paragraphHtml = '<p data-index="'+(paragraphCount++)+'" data-in="'+w.in+'" data-in-formatted="'+secondsToHHMMSS(w.in)+'">';
    }

    if (w.confidence < 0.7) {
      paragraphHtml += '<span data-in="'+w.in+'" data-confidence="'+w.confidence+'" class="low-confidence">'+word+'</span>';
    } else {
      paragraphHtml += '<span data-in="'+w.in+'" data-confidence="'+w.confidence+'" class="maximum-confidence">'+word+'</span>';
    }
    
    if (transcript[index+1]) {
      if ((w.out + newSentanceThreshold) < transcript[index+1].in) {
        // If it's the last word in a sentance add a period
        paragraphHtml += ".";
        paragraphHtml += "</p>";
        paragraphHtmlArray.push(paragraphHtml);
      } else if (paragraphHtml.length >= newSentenceCharacterThreshold) {
        // @TODO newSentenceCharacterThreshold includes HTML chars, very hacky.
        // Just needed SOMETHING to break up long sentances as watson translator can't handle them.
        paragraphHtml += "</p>";
        paragraphHtmlArray.push(paragraphHtml);
      } else {
        // Otherwise just add a space
        paragraphHtml += " ";
      }
    } else {
      // If it's the last word in the transcript just add with a period
      paragraphHtml += ".";
      paragraphHtml += "</p>";
      paragraphHtmlArray.push(paragraphHtml);
    }
  });
  
  return paragraphHtmlArray;
}

function secondsToHHMMSS(seconds) {
  var sec_num = parseInt(seconds, 10); // don't forget the second param
  var hours   = Math.floor(sec_num / 3600);
  var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
  var seconds = sec_num - (hours * 3600) - (minutes * 60);

  var hourSeparator = ':';
  var minuteSeparator = ':';

  if (hours == 0) {hours = '';hourSeparator = '';}
  if (minutes < 10 && hours != 0) {minutes = "0"+minutes;}
  if (seconds < 10) {seconds = "0"+seconds;}
  var time = hours+hourSeparator+minutes+minuteSeparator+seconds;
  return time;
}

function setSourceLanguage() {
  var select = document.getElementById("source-language");
  socket.emit("set_speech_to_text_options", { language: select.options[select.selectedIndex].value });
}

function setVoice() {
  
}

function translateParagraph(paragraphIndex, translateAll) {
  if (typeof paragraphIndex == 'undefined') paragraphIndex = 0;
  if (typeof continueUntilComplete == 'undefined') continueUntilComplete = false;
  var transcription = document.getElementById('transcription');
  var paragraphs = Array.prototype.slice.call(transcription.getElementsByTagName('p'));

  var voiceSelect = document.getElementById("voice");
  var voice = voiceSelect.options[voiceSelect.selectedIndex].value;

  var sourceLangSelect = document.getElementById("source-language");
  var sourceLang = transcriptionOptions[sourceLangSelect.options[sourceLangSelect.selectedIndex].value].language;
  
  var voiceSelect = document.getElementById("voice");
  var targetLang = voiceOptions[voiceSelect.options[voiceSelect.selectedIndex].value].language;

  if (paragraphs[paragraphIndex]) {
    var paragraph = paragraphs[paragraphIndex];
    var spans = Array.prototype.slice.call(paragraph.getElementsByTagName('span'));
    var timings = [];
    spans.forEach(function(span) {
      timings.push(span.getAttribute('data-in'));
    });
    var params = {
      text: paragraph.innerText,
      source: sourceLang,
      target: targetLang,
      data: {
        paragraphIndex: paragraphIndex,
        timings: timings,
        translateAll: translateAll
      }
    };
    socket.emit('translate', params);
  }
}

socket.on('translation_error', function(event) {
  // If there is a translation error, enable refresh button
  // @TODO Improve error handling
  document.getElementById("update-translation").style.display = 'block';
  document.getElementById("update-output").style.display = 'block';
});

socket.on('translation', function(event) {
  var translation = document.getElementById('translation');
  var transcription = document.getElementById('transcription');
    
  if (event.translations && event.translations[0].translation) {
    var text = event.translations[0].translation;
    var words = text.split(' ');
    var html = '';
    words.forEach(function(word, index) {
      var timeIn = event.data.timings[index] || event.data.timings[event.data.timings.length] || 0;
      if (index > 0) html += ' ';
      html += '<span data-in="'+timeIn+'">'+word+'</span>';
    });

    var translationParagraphs = Array.prototype.slice.call(translation.getElementsByTagName('p'));
    var transcriptionParagraphs = Array.prototype.slice.call(transcription.getElementsByTagName('p'));
    if (translationParagraphs[event.data.paragraphIndex]) {
      // Update existing paragraph
      translationParagraphs[event.data.paragraphIndex].innerHTML = html;
      translationParagraphs[event.data.paragraphIndex].setAttribute('data-in-formatted', transcriptionParagraphs[event.data.paragraphIndex].getAttribute('data-in-formatted'));
      translationParagraphs[event.data.paragraphIndex].setAttribute('data-in', transcriptionParagraphs[event.data.paragraphIndex].getAttribute('data-in'));
    } else {
      // Create new paragraph
      var p = document.createElement("p");
      p.innerHTML = html;
      translation.appendChild(p);
    }
  }

  transcriptionParagraphs = Array.prototype.slice.call(transcription.getElementsByTagName('p'));
  if (transcriptionParagraphs[event.data.paragraphIndex+1]) {
    translateParagraph(event.data.paragraphIndex+1, true);
  }

  // If the transcription not in progress and translation is at least as long 
  // as transcription then we must have finished translating so make sure this 
  // is reflected in UI.
  transcriptionParagraphs = Array.prototype.slice.call(transcription.getElementsByTagName('p'));
  translationParagraphs = Array.prototype.slice.call(translation.getElementsByTagName('p'));
  if (document.getElementById("transcription-in-progress").style.display == 'none'
      && translationParagraphs.length >= transcriptionParagraphs.length) {
    document.getElementById("translation-in-progress").style.display = 'none';
    document.getElementById("update-translation").style.display = 'block';
    document.getElementById("update-output").style.display = 'block';
    document.getElementById("translation").setAttribute('contentEditable', true);
    // Generate video with new synthesize audio (using the translation)
    synthesizeScript();
    // Hack to fix bad transcription timestamps (should go in mutex observer!)
    transcriptionParagraphs.forEach(function(paragraph, index) {
      if (translationParagraphs[index] && translationParagraphs[index].getAttribute('data-in-formatted'))
        transcriptionParagraphs[index].setAttribute('data-in-formatted', translationParagraphs[index].getAttribute('data-in-formatted'));
      if (translationParagraphs[index] && translationParagraphs[index].getAttribute('data-in'))
        transcriptionParagraphs[index].setAttribute('data-in', translationParagraphs[index].getAttribute('data-in'));
    });
  }

});

var insertListener = function(event) {
  if (event.animationName == "nodeInsertedIntoScript") {
    
    // Only allow <p> tags in root level on scripts
    if (event.target.nodeName != 'P') return event.target.remove();
    
    event.target.removeAttribute('data-in-formatted');
    event.target.removeAttribute('data-in');
    var span = event.target.getElementsByTagName('span')[0];
    if (span && span.getAttribute('data-in')) {
      event.target.setAttribute('data-in-formatted', secondsToHHMMSS(span.getAttribute('data-in')));
      event.target.setAttribute('data-in', span.getAttribute('data-in'));
    }
  }
  
}
document.addEventListener("animationstart", insertListener, false);
document.addEventListener("MSAnimationStart", insertListener, false);
document.addEventListener("webkitAnimationStart", insertListener, false);

var transcriptionObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    var transcription = document.getElementById('transcription');
    
    if (!transcription.getAttribute('contentEditable')) return;

    var paragraphs = Array.prototype.slice.call(transcription.getElementsByTagName('p'));
    paragraphs.forEach(function(paragraph, index) {
      var children = Array.prototype.slice.call(paragraph.childNodes);
      children.forEach(function(child) {
        if (child.style && child.style.color)
          child.style.color = "inherit";
        if (child.style && child.style.backgroundColor)
          child.style.backgroundColor = "inherit";
      });
    });
  });
});
transcriptionObserver.observe(document.querySelector('#transcription'), { childList: true, subtree: true, characterData: true });

var translationObserver = new MutationObserver(function(mutations) {
  mutations.forEach(function(mutation) {
    var translation = document.getElementById('translation');
    
    if (!translation.getAttribute('contentEditable')) return;
    
    var paragraphs = Array.prototype.slice.call(translation.getElementsByTagName('p'));
    paragraphs.forEach(function(paragraph) {
      var children = Array.prototype.slice.call(paragraph.childNodes);
      children.forEach(function(child) {
        if (child.style && child.style.color)
          child.style.color = "inherit";
        if (child.style && child.style.backgroundColor)
          child.style.backgroundColor = "inherit";
      });
    });
  });
});
translationObserver.observe(document.querySelector('#translation'), { childList: true, characterData: true });
 
setTimeout(function() {
  if (document.getElementById("status").innerHTML == "Transcribing complete")
    document.getElementById("status").innerHTML = "";
}, 1000);

socket.on('synthesized', function(event) {
// @TODO Generate spoken text line-by-line (for quick revisions to check pronunciation)
});

socket.on('synthesized_script', function(event) {
  document.getElementById("video-output-placeholder").style.display = 'none';
  document.getElementById("video-output").src = event.url;
  document.getElementById("video-output").style.display = "block";
  document.getElementById("video-output").oncanplaythrough = function() {
    document.getElementById("video-input").pause();
    document.getElementById("video-output").play();
  };
});

socket.on('synthesize_script_error', function(event) {
  console.log('synthesize_script_error', event);
  document.getElementById("video-output-placeholder").innerHTML = "Something went wrong :(";
});

socket.on('text_to_speech_options', function(event) {
  voiceOptions = event.voices;
  var select = document.getElementById('voice');
  for (var voice in event.voices) {
    select.options[select.options.length] = new Option(event.voices[voice].label, voice);
  }
  select.value = select.options[0].value;
  document.getElementById("video-output-options").style.display = 'block';
});
socket.emit("text_to_speech_options");

socket.on('speech_to_text_options', function(event) {
  transcriptionOptions = event.languages;
  var select = document.getElementById('source-language');
  for (var language in event.languages) {
    select.options[select.options.length] = new Option(event.languages[language].label, language);
  }
  select.value = "en-US_BroadbandModel";
  socket.emit("set_speech_to_text_options", { language: select.options[select.selectedIndex].value });
  document.getElementById("video-input-options").style.display = 'block';
});
socket.emit("speech_to_text_options");

function synthesizeScript() {
  document.getElementById("video-output").pause();
  document.getElementById("video-output").src = '';
  document.getElementById("video-output-placeholder").innerHTML = '<i class="fa fa-circle-o-notch fa-spin"></i> Creating new video…';
  document.getElementById("video-output-placeholder").style.display = "inline-block";
  document.getElementById("video-output").style.display = "none";
  
  var script = [];
  var voiceSelect = document.getElementById("voice");
  var voice = voiceSelect.options[voiceSelect.selectedIndex].value;
  
  var transcription = document.getElementById('translation');
  var paragraphs = Array.prototype.slice.call(translation.getElementsByTagName('p'));
  paragraphs.forEach(function(paragraph) {
    if (paragraph.innerText && paragraph.innerText != '')
      script.push({in: paragraph.getAttribute('data-in'), text: paragraph.innerText});
  });
  var pathToVideoFile = document.getElementById("video-input").src.split('/');
  socket.emit("synthesize_script", { video: pathToVideoFile[pathToVideoFile.length - 1], script: script, voice: voice });
}