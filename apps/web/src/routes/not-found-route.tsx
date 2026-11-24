import { MapPinOff } from "lucide-react";
import { Link } from "react-router";
import { StatusMessage } from "@/components/status-message";
import { Button } from "@/components/ui/button";

export function NotFoundRoute() {
  return (
    <StatusMessage icon={<MapPinOff />} title="Page not found">
      <Button asChild variant="outline" size="lg">
        <Link to="/">Back to notes</Link>
      </Button>
    </StatusMessage>
  );
}
