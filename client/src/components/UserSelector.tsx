import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check } from "lucide-react";

interface User {
  id: string;
  name: string;
}

interface UserSelectorProps {
  users: User[];
  selectedUser: string;
  onSelectUser: (userId: string) => void;
}

export default function UserSelector({ users, selectedUser, onSelectUser }: UserSelectorProps) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Select Speaker</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2" data-testid="user-selector">
          {users.map(user => {
            const isSelected = selectedUser === user.id;
            const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
            
            return (
              <Button
                key={user.id}
                variant={isSelected ? "default" : "outline"}
                onClick={() => {
                  onSelectUser(user.id);
                  console.log(`Selected user: ${user.name}`);
                }}
                className="gap-2"
                data-testid={`button-user-${user.id}`}
              >
                <Avatar className="w-5 h-5">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                <span>{user.name}</span>
                {isSelected && <Check className="w-4 h-4" />}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
