import React from 'react';

const Message = ({ sender, text, createdAt }) => {
  const isYou = sender === 'You';

  // Define base classes for all messages
  const baseClasses = 'rounded-lg px-4 py-2 max-w-xs lg:max-w-md shadow-md';

  // Define classes based on the sender
  const messageClass = isYou
    ? 'bg-blue-500 text-white self-end'
    : 'bg-gray-200 text-gray-800 self-start';

  // Function to format Firestore Timestamp to a readable time string
  const formatTime = (timestamp) => {
    if (!timestamp || !timestamp.toDate) {
      return '';
    }
    const date = timestamp.toDate();
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex ${isYou ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`${baseClasses} ${messageClass}`}>
        <p className="text-sm">{text}</p>
        <div className="text-xs text-right mt-1 opacity-75">
          {formatTime(createdAt)}
        </div>
      </div>
    </div>
  );
};

export default Message;
