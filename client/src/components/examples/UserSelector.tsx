import { useState } from 'react';
import UserSelector from '../UserSelector';

const mockUsers = [
  { id: 'user1', name: 'Alice Johnson' },
  { id: 'user2', name: 'Bob Smith' },
  { id: 'user3', name: 'Carol Davis' },
];

export default function UserSelectorExample() {
  const [selected, setSelected] = useState('user1');
  
  return <UserSelector users={mockUsers} selectedUser={selected} onSelectUser={setSelected} />;
}
