import React from 'react';
import VideoPlayer from './VideoPlayer';

const VideoChat = ({
  localStream,
  remoteStream,
  isAudioMuted,
  isVideoMuted,
  onToggleAudio,
  onToggleVideo,
}) => {
  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden shadow-lg">
      {/* Remote Video */}
      <div className="absolute top-0 left-0 w-full h-full">
        {remoteStream ? (
          <VideoPlayer stream={remoteStream} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            <p>Waiting for partner...</p>
          </div>
        )}
      </div>

      {/* Local Video */}
      <div className="absolute top-4 right-4 w-48 h-36 bg-black rounded-lg overflow-hidden border-2 border-white">
        {localStream && <VideoPlayer stream={localStream} muted={true} />}
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
        <button
          onClick={onToggleAudio}
          className={`p-3 rounded-full text-white transition-colors ${
            isAudioMuted ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {isAudioMuted ? 'Unmute' : 'Mute'}
        </button>
        <button
          onClick={onToggleVideo}
          className={`p-3 rounded-full text-white transition-colors ${
            isVideoMuted ? 'bg-red-500' : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {isVideoMuted ? 'Show Video' : 'Hide Video'}
        </button>
      </div>
    </div>
  );
};

export default VideoChat;
