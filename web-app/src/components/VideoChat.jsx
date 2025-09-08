import React from 'react';
import VideoPlayer from './VideoPlayer';

const VideoChat = ({ localStream, remoteStream }) => {
  return (
    <div className="w-full lg:w-1/2 flex flex-col gap-4">
      <div className="relative w-full h-64 bg-black rounded-lg overflow-hidden">
        {remoteStream ? (
          <VideoPlayer stream={remoteStream} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white">
            <p>Waiting for partner...</p>
          </div>
        )}
      </div>
      <div className="relative w-48 h-36 bg-black rounded-lg overflow-hidden self-center">
        {localStream && <VideoPlayer stream={localStream} muted={true} />}
      </div>
    </div>
  );
};

export default VideoChat;
