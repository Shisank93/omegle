import React, { useState, useRef, useEffect } from 'react';
import Message from './Message';
import StatusIndicator from './StatusIndicator';

const ChatView = ({ messages, onSendMessage, onNext, status, isPartnerConnected }) => {
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

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4 bg-gray-50">
      <header className="text-center mb-4">
        <h1 className="text-4xl font-bold text-gray-800">Omegle Clone</h1>
      </header>
      <main className="flex-1 flex flex-col lg:flex-row bg-white p-4 rounded-lg shadow-lg overflow-hidden">
        {/* Placeholder for video chat area */}
        <div className="hidden lg:flex lg:w-1/2 bg-gray-900 rounded-lg items-center justify-center text-white">
          <p>Video Chat Area (Future)</p>
        </div>

        {/* Text Chat Area */}
        <div className="flex-1 flex flex-col p-2">
          <div id="messages" className="flex-grow bg-gray-100 border border-gray-200 rounded-lg p-4 mb-4 overflow-y-auto">
            <StatusIndicator status={status} />
            {messages.map((msg, index) => (
              <Message key={index} sender={msg.sender} text={msg.text} />
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
              className="flex-grow border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="flex gap-2 mt-4">
            <button
              onClick={onNext}
              className="flex-grow bg-red-500 text-white font-bold py-3 px-5 rounded-lg hover:bg-red-600 transition duration-300"
            >
              Next Stranger
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChatView;
