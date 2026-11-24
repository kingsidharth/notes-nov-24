import { useParams } from "react-router";
import { NotePane } from "@/features/notes/components/note-pane";

export function NoteRoute() {
  const { id = "" } = useParams();
  return <NotePane key={id} id={id} />;
}
