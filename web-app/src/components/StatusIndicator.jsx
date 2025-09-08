import React from 'react';

const StatusIndicator = ({ status }) => {
  if (!status) {
    return null;
  }

  return (
    <div className="text-center my-2">
      <p className="text-sm text-gray-500 italic dark:text-gray-400">{status}</p>
    </div>
  );
};

export default StatusIndicator;
