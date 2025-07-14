/*************************************************************************
         (C) Copyright AudioLabs 2017 

This source code is protected by copyright law and international treaties. This source code is made available to You subject to the terms and conditions of the Software License for the webMUSHRA.js Software. Said terms and conditions have been made available to You prior to Your download of this source code. By downloading this source code You agree to be bound by the above mentionend terms and conditions, which can also be found here: https://www.audiolabs-erlangen.de/resources/webMUSHRA. Any unauthorised use of this source code may result in severe civil and criminal penalties, and will be prosecuted to the maximum extent possible under law. 

**************************************************************************/

class GenericAudioControl {
  constructor(_audioContext, _bufferSize, _stimuli, _errorHandler) {
    // note: buffersize and errorhandler are ignored; just exists for compatibility
    this.audioContext = _audioContext;  // BaseAudioContext object
    this.stimuli = _stimuli;   // array of Stimulus objects representing the stimuli presented on the page 

    // Event handler here instead of processor
    this.eventListeners = [];  // array of event listeners
  }

  // methods for dealing with the event listeners
  removeEventListener (_index) {
    this.eventListeners[_index] = null; 
  }

  addEventListener (_listenerFunction) {
    this.eventListeners[this.eventListeners.length] = _listenerFunction;
    return this.eventListeners.length-1;
  }

  sendEvent (_event) {
    // trigger all listed event listeners with received event
    for (var i = 0; i < this.eventListeners.length; ++i) {
      if (this.eventListeners[i] === null) {
          continue;
      }
      this.eventListeners[i](_event);
    } 
  }

  // methods for setting the audio command
  play (_index) {
    this.scriptNode.port.postMessage({command: "play", param: _index});
  }

  stop () {
    this.scriptNode.port.postMessage({command: "stop"});
  }

  pause () {
    this.scriptNode.port.postMessage({command: "pause"});
  }

  // methods for dealing with the current and max positions of the stimuli
  async getPosition (_index) {
    return await this.sendMessage({command: "getPosition", param: _index});
  }

  getDuration (_index) {
    return this.stimuli[_index][0].length;
  }

  setPosition (_position, _setStartEnd) {
    this.scriptNode.port.postMessage({command: "setPosition", param: {pos: _position, startend: _setStartEnd}});
  }


  // methods for initializing and freeing everything
  initAudio () {
    // Create and connect AudioWorkletNode including AudioWorkletProcessor
    this.scriptNode = new AudioNode(this.audioContext, this.stimuli);
    this.gainNode = this.audioContext.createGain()
    this.audioContext.gainNode = this.gainNode

    // Connect the nodes to the destination
    this.scriptNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    // set previously determined volume
    this.audioContext.gainNode.gain.setValueAtTime(this.audioContext.volume, this.audioContext.currentTime);

    // receive event messages from processor
    this.scriptNode.port.onmessage = (function (_event) {
      this.sendEvent(_event.data);
    }).bind(this);

  }

  freeAudio () {
    this.stop();
    this.scriptNode.disconnect();
    this.scriptNode = null;
    this.gainNode.disconnect();
    this.gainNode = null;
  }

}

class AudioNode extends AudioWorkletNode {
    constructor(_audioContext, _stimuli) {
      // convert array of stimuli with buffer to array of arrays of arrays
      let stimuli_arr = [];
      for (let i = 0; i < _stimuli.length; i++){
        let s = _stimuli[i].getAudioBuffer();
        let s_arr = [];
        for (let j = 0; j < s.numberOfChannels; j++){
          s_arr.push(s.getChannelData(j));
        }
        stimuli_arr.push(s_arr);
      }

      // determine number of channels and cap at stereo
      let channelCount = _audioContext.destination.channelCount;
      if ( channelCount > 2){
        channelCount = 2;  // TODO: no hard limit? -> need to change mapInputToOutputChannels
      }

      const _processorOptions = { stimuli: stimuli_arr};
      super(_audioContext, 'AudioProcessor', {
        processorOptions: _processorOptions, 
        channelCount: channelCount,
        channelCountMode:  'explicit',
        outputChannelCount:[ channelCount ]
      });

    }
}
