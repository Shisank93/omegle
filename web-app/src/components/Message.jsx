import React from 'react';

const Message = ({ sender, text }) => {
  const isYou = sender === 'You';

  const messageClass = isYou
    ? 'bg-blue-500 text-white self-end'
    : 'bg-gray-300 text-black self-start';

  return (
    <div className={`flex ${isYou ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`rounded-lg px-4 py-2 max-w-xs lg:max-w-md ${messageClass}`}>
        <p className="font-bold">{sender}</p>
        <p>{text}</p>
      </div>
    </div>
  );
};

export default Message;
