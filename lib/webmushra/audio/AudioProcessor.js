// Uses AudioWorkletNode instead of ScriptProcessorNode (deprecated)
class AudioProcessor extends AudioWorkletProcessor {
    // AudioWorkletProcessor for GenericAudioControl
    constructor (options) {
        super();
        this.stimuli = options.processorOptions.stimuli;   // array of arrays of arrays representing the stimuli presented on the page 
        
        this.audioStimulusIndex = null;  // index of current stimulus
        this.audioCommand = null; // 'play', 'pause', 'stop', 'switch'
        this.audioCommandSwitchIndex = null;  // new index where audioCommand should be applied
        
        this.audioMaxPositions = [];  // array of lengths of the respective stimuli
        this.audioCurrentPositions = [];  // array of the current positions within the respective stimuli
        var i;
        for (i = 0; i < this.stimuli.length; ++i) {
            this.audioCurrentPositions[i] = 0;
            this.audioMaxPositions[i] = this.stimuli[i][0].length;    
        }

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

    // methods for setting the audio command
    play (_index) {
        if (this.audioStimulusIndex === null) {
            this.audioStimulusIndex = _index;
            this.audioCommand = 'play';
        } else if (this.audioStimulusIndex !== _index) {
            this.audioCommand = 'switch';
            this.audioCommandSwitchIndex = _index;
        }
    }

    stop () {
        if (this.audioStimulusIndex !== null) {
            this.audioCommand = 'stop';
            this.audioStimulusIndex = null;
        }
    }

    pause () {
        if (this.audioStimulusIndex !== null) {
            this.audioCommand = 'pause';
        }
    }

    // methods for dealing with the current and max positions of the stimuli
    getPosition (_index) {
       return this.audioCurrentPositions[_index];
    }

    getDuration (_index) {
        return this.audioMaxPositions[_index];
    }

    setPosition (_position, _setStartEnd) {
        var index = this.audioStimulusIndex;
        if (index == null) {
            index = 0;
        }
        this.audioCurrentPositions[index] = _position;
        // inform node about current position
        var eventUpdate = {
            name: 'processUpdate',
            currentSample: this.audioCurrentPositions[index],
            numSamples: this.audioMaxPositions[index],
            index: index
        };  
        this.sendEvent(eventUpdate);  
    }


    // process method implements actual functionality of AudioWorkletProcessor
    process (inputs, outputs, parameters) {
        // inputs: array of arrays of arrays (num items * num channels * num samples)
        // outputs: same size as inputs (only first item index is used here)
        // inputs is not used here; input signal comes from stimuli buffer

        const index = this.audioStimulusIndex;  // current input index
        const indexSwitch = this.audioCommandSwitchIndex;  // index to switch to
        let currentPosition = null;  // current position at index
        let currentPositionSwitch = null;  // current position at index to switch to
        let outputData;  // data that will be written into outputs
        let inputData;  // data read from current stimulus
        
        if (index === null) {
            // if no stimuli is selected set output to zero/silence (default)
            return true; // Keep the processor alive
        }

        // get current input array
        const stimulus_arr = this.stimuli[index];    

        // upmixing of mono signals and ignoring all channels above stereo
        const inputChannels = stimulus_arr.length;
        let mapInputToOutputChannels;
        if (inputChannels == 1 ) {
            mapInputToOutputChannels = [0,0];
        } else {
            mapInputToOutputChannels = [0,1];
        }

        // fill output array from stimuli
        if (this.audioCommand === 'switch') {
            // get input array to switch to
            const stimulusSwitch_arr = this.stimuli[indexSwitch];    
            
            for ( let channel = 0; channel < outputs[0].length; channel++) {
                // get input and output data and positions
                outputData = outputs[0][channel]
                inputData = stimulus_arr[mapInputToOutputChannels[channel]];
                const inputDataSwitch = stimulusSwitch_arr[mapInputToOutputChannels[channel]];
            
                currentPosition = this.audioCurrentPositions[index];
                currentPositionSwitch = this.audioCurrentPositions[indexSwitch];  

                for (let sample = 0; sample < outputData.length; sample++) {
                    // cross-fade
                    outputData[sample] = inputData[currentPosition++] * (1.0 - sample/outputData.length) + inputDataSwitch[currentPositionSwitch++] * (sample/outputData.length);      
                    // stop playing when end of audio is reached
                    if (currentPosition >= this.audioMaxPositions[index]) {
                        currentPosition = 0;
                        if (channel === 0){
                            event = { 
                                name: 'ended',
                                index:  index
                            };  
                            this.sendEvent(event);
                        };
                        this.stop();
                        break;
                    }
                    if (currentPositionSwitch >= this.audioMaxPositions[indexSwitch]) {
                        currentPositionSwitch = 0;
                        if (channel === 0){
                            event = { 
                                name: 'ended',
                                index:  indexSwitch
                            };  
                            this.sendEvent(event);
                        };
                        this.stop();
                        break;
                    }
                }
            }    
        } 
        else {
            for (let channel = 0; channel < outputs[0].length; channel++) { 
                // get input and output data and position
                outputData = outputs[0][channel];
                inputData = stimulus_arr[mapInputToOutputChannels[channel]];

                currentPosition = this.audioCurrentPositions[index];  

                for (let sample = 0; sample < outputData.length; sample++) {
                    // write input to output one sample at a time
                    outputData[sample] = inputData[currentPosition++];  
                    // stop playing when end of audio is reached    
                    if (currentPosition >= this.audioMaxPositions[index]) {
                        currentPosition = 0;
                        if (channel === 0){
                            event = { 
                                name: 'ended',
                                index:  index
                            };  
                            this.sendEvent(event);
                        };
                        this.stop();
                        break;
                    }
                }
            }
        } 
        this.audioCurrentPositions[index] = currentPosition;
        
        // modify output array
        // fadeout 
        if (this.audioCommand === 'pause' || this.audioCommand === 'stop') {
            for (let channel = 0; channel < outputs[0].length; channel++) { 
                for (let sample = 0; sample < outputData.length; sample++) {  
                    outputData[sample] = outputData[sample] * (1.0 - sample/outputData.length);  
                }   
            }
            
            this.audioStimulusIndex = null;
            if (this.audioCommand === 'stop') {
                this.audioCurrentPositions[index] = 0;
            }
        }

        // fadein
        else if (this.audioCommand === 'play') {
            for (let channel = 0; channel < outputs[0].length; channel++) {
                for (let sample = 0; sample < outputData.length; sample++) {  
                    outputData[sample] = outputData[sample] * (sample/outputData.length);         
                }   
            }
        }  
        
        // inform node about current position
        var event = {
            name: 'processUpdate',
            currentSample:  currentPosition,
            numSamples: this.audioMaxPositions[index],
            index:  index
        };  
        this.sendEvent(event);
        
        if (this.audioCommand === 'switch') {
            this.audioCurrentPositions[indexSwitch] = currentPositionSwitch; 
            this.audioStimulusIndex = indexSwitch;
            event = { 
                name: 'processUpdate',
                currentSample:  currentPositionSwitch,
                numSamples: this.audioMaxPositions[indexSwitch],
                index:  indexSwitch
            };  
            this.sendEvent(event);    
        }     
        this.audioCommand = null;

        return true; // Keep the processor alive
    }
}

registerProcessor("AudioProcessor", AudioProcessor);