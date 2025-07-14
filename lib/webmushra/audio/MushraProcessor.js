// Uses AudioWorkletNode instead of ScriptProcessorNode (deprecated)
class MushraProcessor extends AudioWorkletProcessor {
    // AudioWorkletProcessor for MushraAudioControl
    constructor (options) {
        super();
        this.conditions = options.processorOptions.conditions;  // array of arrays of arrays representing the stimuli presented on the page
        this.reference = options.processorOptions.reference; // array of arrays representing the reference
        this.ids = options.processorOptions.ids; // array containing condition ids
        this.sampleRate = options.processorOptions.sampleRate;

        this.audioStimulus = null; // current stimulus array

        this.audioPlaying = false;
        this.audioIsReferencePlaying = null;
        this.audioCurrentPosition = 0;
        this.audioMaxPosition = options.processorOptions.audioMaxPosition;

        // looping parmeters
        this.audioLoopStart = 0;
        this.audioLoopEnd = options.processorOptions.audioMaxPosition;  
        this.audioLoopingActive = true;
        this.audioMinimumLoopDuration = parseInt(options.processorOptions.sampleRate * 0.5); 
        
        // fading parmeters
        this.audioFadingActive = 0; // 0 = no, 1 = fade_out, 2 = fade_in
        this.audioFadingIn = null;
        this.audioFadingCurrentPosition = 0;
        this.audioFadingMaxPosition = parseInt(options.processorOptions.sampleRate * 0.005);    

        // requests
        this.audioCurrentPositionRequest = null; 
        this.audioFadingActiveRequest = null;

        // for communication with AudioWokletNode
        this.port.onmessage = (event) => {
            // call methods of this class dynamically
            let command = event.data.command
            if (typeof this[command] === "function") {
                const response = this[command](event.data.param);
            } else {
                console.error(`Unknown method: ${command}`);
            }
        }
    }

    // method for dealing with the event listeners
    sendEvent (_event) {
        // send event to node
        this.port.postMessage(_event);
    }

    // fading
    fadeOut (_stimulusFadeIn) {
        this.audioFadingIn = _stimulusFadeIn;
        this.audioFadingCurrentPositionRequest = 0;
        this.audioFadingActiveRequest = 1;
    }

    fadeIn (_stimulusFadeIn) {
        this.audioFadingIn = _stimulusFadeIn;
        this.audioFadingCurrentPositionRequest = 0;
        this.audioFadingActiveRequest = 2;
    }


    // methods for playing and pausing
    play (_stimulus, _isReference) {
        if (_stimulus === null) {
            _stimulus = this.audioStimulus;
        }

        if ((this.audioStimulus !== _stimulus || _isReference !== this.audioIsReferencePlaying) && this.audioStimulus !== null && this.audioPlaying !== false) {
            this.fadeOut(_stimulus);
        } 
        else {
            this.audioStimulus = _stimulus;
            if (this.audioPlaying === false) {      
                this.fadeIn(_stimulus);
            }          
        }    
        this.audioPlaying = true;  
    }

    playReference () {
        this.play(this.reference, true);
        this.audioIsReferencePlaying = true;

        var event = {
            name: 'playReferenceTriggered',
            conditionLength : this.conditions.length
        };  
        this.sendEvent(event);
    }

    playCondition (_index) {
        this.play(this.conditions[_index], false);  
        this.audioIsReferencePlaying = false;
        var event = {
            name: 'playConditionTriggered',
            index : _index,
            length : this.conditions.length
        };  
        this.sendEvent(event);
    }

    pause () {
        if (this.audioPlaying === true) {
            this.fadeOut(null);
        }
        var event = {
            name: 'pauseTriggered',
            conditionLength : this.conditions.length
        };  
        this.sendEvent(event);
    }

    stop () {
        this.audioCurrentPositionRequest = this.audioLoopStart;
        if (this.audioPlaying === true) {
            this.fadeOut(null);
        }
        var event = {
            name: 'stopTriggered',
            conditionLength : this.conditions.length
        };  
        this.sendEvent(event);
        
        var eventUpdate = {
            name: 'processUpdate',
            currentSample:  this.audioCurrentPositionRequest,
            sampleRate: this.sampleRate
        };  
        this.sendEvent(eventUpdate);
    }

    // getters and setters
    getPosition (_index) {
        return this.currentAudioPosition
    }

    setPosition (_position_setStartEnd) {
        this.audioCurrentPositionRequest = _position_setStartEnd["position"];
        let _setStartEnd = _position_setStartEnd["setStartEnd"];
        if(_setStartEnd){
            if (_position < this.audioLoopStart || _position <= parseInt((this.audioLoopEnd + this.audioLoopStart)/2)) {
                this.setLoopStart(_position);
            }
            else if (_position > this.audioLoopEnd || _position > parseInt((this.audioLoopEnd + this.audioLoopStart)/2)) {
                this.setLoopEnd(_position);
            }
        } 
        var eventUpdate = {
            name: 'processUpdate',
            currentSample:  this.audioCurrentPositionRequest,
            sampleRate: this.sampleRate
        }
        this.sendEvent(eventUpdate);  
    }

    getDuration () {
        return this.audioMaxPosition;
    }

    setLoopingActive (_loopingActive) {
        this.audioLoopingActive = _loopingActive;
    }

    isLoopingActive () {
        return this.audioLoopingActive;
    }

    setLoopStart (_start) {
        if (_start >= 0 && _start < this.audioLoopEnd && (this.audioLoopEnd-_start) >= this.audioMinimumLoopDuration) {
            this.audioLoopStart = _start;
            if (this.audioCurrentPosition < this.audioLoopStart) {
                this.audioCurrentPositionRequest = this.audioLoopStart;
            }    
            var event = {
                name: 'loopStartChanged',      
                start : this.audioLoopStart,
                end : this.audioLoopEnd
            };  
            this.sendEvent(event);
        } 
    }

    setLoopEnd (_end) {
        if (_end <= this.audioMaxPosition && _end > this.audioLoopStart && (_end-this.audioLoopStart) >= this.audioMinimumLoopDuration) {
            this.audioLoopEnd = _end;    
            if (this.audioCurrentPosition > this.audioLoopEnd) {
                this.audioCurrentPositionRequest = this.audioLoopEnd;
            }    
            var event = {
                name: 'loopEndChanged',
                start : this.audioLoopStart,
                end : this.audioLoopEnd     
            };  
            this.sendEvent(event);
        }
    }

    setLoop (_start_end) {
        var changed = false;
        let _start = _start_end["start"]
        let _end = _start_end["end"]
        if (_start >= 0 && _start < this.audioLoopEnd && (_end-_start) >= this.audioMinimumLoopDuration && _start != this.audioLoopStart) {
            this.audioLoopStart = _start;
            if (this.audioCurrentPosition < this.audioLoopStart) {
                this.audioCurrentPositionRequest = this.audioLoopStart;
            }   
            changed = true; 
        }  
        if (_end <= this.audioMaxPosition && _end > this.audioLoopStart && (_end-_start) >= this.audioMinimumLoopDuration && _end != this.audioLoopEnd) {
            this.audioLoopEnd = _end;    
            if (this.audioCurrentPosition > this.audioLoopEnd) {
                this.audioCurrentPositionRequest = this.audioLoopEnd;
            }    
            changed = true;
        }

        if (changed == true) {
            var event = {
                name: 'loopChanged',
                start : this.audioLoopStart,
                end : this.audioLoopEnd    
            };  
            this.sendEvent(event);
        }	    
    }


    // process method implements actual functionality of AudioWorkletProcessor
    process (inputs, outputs, parameters) {
        // inputs: array of arrays of arrays (num items * num channels * num samples)
        // outputs: same size as inputs (only first item index is used here)
        // inputs is not used here; input signal comes from stimuli buffer
        
        let stimulus = this.audioStimulus;
        let loopingActive = this.audioLoopingActive;
        let outputData;  // data that will be written into outputs
        let inputData;  // data read from current stimulus
        
        if (stimulus === null || this.audioPlaying === false) {
            //if no stimuli is selected set output to zero/silence (default)
            return true; // Keep the processor alive
        }
        
        if (this.audioCurrentPosition < this.audioLoopStart) {
            // start at beginning of loop
            this.audioCurrentPosition = this.audioLoopStart;
        }

        // take care of requests
        if (this.audioCurrentPositionRequest !== null) {
            this.audioCurrentPosition = this.audioCurrentPositionRequest;
            this.audioCurrentPositionRequest = null;
        } 
        if (this.audioFadingActiveRequest !== null) {
            this.audioFadingActive = this.audioFadingActiveRequest;
            this.audioFadingActiveRequest = null;
        }
 
        // upmixing of mono signals and ignoring all channels above stereo
        let inputChannels = 1;
        if (stimulus){
            inputChannels = stimulus.length;
        }
        let mapInputToOutputChannels;
        if (inputChannels == 1 ) {
            mapInputToOutputChannels = [0,0];
        } else {
            mapInputToOutputChannels = [0,1];
        }

        let currentPosition;
        let fadingCurrentPosition;
        let fadingActive;
        // fill output array from conditions
        for (let channel = 0; channel < outputs[0].length; channel++) {
            outputData = outputs[0][channel];
            inputData = this.audioStimulus[mapInputToOutputChannels[channel]]
            currentPosition = this.audioCurrentPosition; 
            fadingCurrentPosition = this.audioFadingCurrentPosition;      
            fadingActive = this.audioFadingActive;

            for (let sample = 0; sample < outputData.length; sample++) {
            
                // loop almost at end => fading is triggered
                if (loopingActive && (currentPosition == (this.audioLoopEnd - this.audioFadingMaxPosition))) {
                    fadingActive = 1;
                    this.audioFadingIn = this.audioStimulus;
                    fadingCurrentPosition = 0;        
                }
            
                if (fadingActive == 1) { // fade out
                    let ramp = 0.5 * (1 + Math.cos(Math.PI*(fadingCurrentPosition++)/(this.audioFadingMaxPosition-1)));
                    outputData[sample] = inputData[currentPosition++] * ramp;
                    if (fadingCurrentPosition >= this.audioFadingMaxPosition) {          
                        fadingCurrentPosition = 0;
                        if (this.audioFadingIn === null) {
                            // fade to silence
                            this.audioPlaying = false;
                            fadingActive = 0;
                            break;
                        }
                        else {
                            // fade to other audio
                            fadingActive = 2;
                            stimulus = this.audioStimulus = this.audioFadingIn;
                            inputData = stimulus[mapInputToOutputChannels[channel]];
                        }
                    }
                }
                else if (fadingActive == 2) { // fade in
                    let ramp = 0.5 * (1 - Math.cos(Math.PI*(fadingCurrentPosition++)/(this.audioFadingMaxPosition-1)));
                    outputData[sample] = inputData[currentPosition++] * ramp;
                    if (fadingCurrentPosition >= this.audioFadingMaxPosition) {
                        fadingCurrentPosition = 0;
                        fadingActive = 0;
                    }
                }
                else { // just play
                    outputData[sample] = inputData[currentPosition++];      
                }

                // loop
                if (this.audioLoopEnd && currentPosition >= this.audioLoopEnd) {
                    currentPosition = this.audioLoopStart;
                    if (loopingActive === false) {
                        this.audioPlaying = false;
                    }
                }
            }   
        }
        
        this.audioCurrentPosition = currentPosition;  
        this.audioFadingCurrentPosition = fadingCurrentPosition;
        this.audioFadingActive = fadingActive;
        
        var event = {
            name: 'processUpdate',
            currentSample:  this.audioCurrentPosition,
            sampleRate: this.sampleRate
        };  
        this.sendEvent(event);

        return true; // Keep the processor alive
    }
}

registerProcessor("MushraProcessor", MushraProcessor);