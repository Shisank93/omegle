import React, { useState, useRef, useEffect } from 'react';
import Message from './Message';
import StatusIndicator from './StatusIndicator';
import VideoChat from './VideoChat';

const ChatView = ({
  messages,
  onSendMessage,
  onNext,
  onReport,
  onBlock,
  status,
  isPartnerConnected,
  localStream,
  remoteStream,
  isAudioMuted,
  isVideoMuted,
  onToggleAudio,
  onToggleVideo,
}) => {
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (text.trim()) {
      onSendMessage(text);
      setText('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasVideo = localStream || remoteStream;

  return (
    <div className="flex flex-col h-screen max-w-6xl mx-auto p-4 font-sans">
      <header className="text-center mb-4">
        <h1 className="text-5xl font-bold text-gray-800 dark:text-white">Vergo</h1>
      </header>
      <main className={`flex-1 flex flex-col lg:flex-row bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-2xl overflow-hidden gap-4`}>
        {hasVideo && (
          <div className="lg:w-1/2">
            <VideoChat
              localStream={localStream}
              remoteStream={remoteStream}
              isAudioMuted={isAudioMuted}
              isVideoMuted={isVideoMuted}
              onToggleAudio={onToggleAudio}
              onToggleVideo={onToggleVideo}
            />
          </div>
        )}

        {/* Text Chat Area */}
        <div className={`flex-1 flex flex-col p-2 ${!hasVideo ? 'lg:w-full' : 'lg:w-1/2'}`}>
          <div id="messages" className="flex-grow bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 mb-4 overflow-y-auto space-y-4">
            <StatusIndicator status={status} />
            {messages.map((msg) => (
              <Message key={msg.id} sender={msg.sender} text={msg.text} createdAt={msg.createdAt} />
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-grow border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              disabled={!isPartnerConnected}
            />
            <button
              onClick={handleSend}
              className="bg-blue-500 text-white font-bold py-3 px-5 rounded-lg hover:bg-blue-600 transition duration-300 disabled:bg-gray-400"
              disabled={!isPartnerConnected}
            >
              Send
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <button
              onClick={onNext}
              className="bg-red-500 text-white font-bold py-3 px-5 rounded-lg hover:bg-red-600 transition duration-300"
            >
              Next
            </button>
            <button
              onClick={onReport}
              className="bg-yellow-500 text-white font-bold py-3 px-5 rounded-lg hover:bg-yellow-600 transition duration-300"
            >
              Report
            </button>
            <button
              onClick={onBlock}
              className="bg-gray-700 text-white font-bold py-3 px-5 rounded-lg hover:bg-gray-800 transition duration-300"
            >
              Block
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChatView;
