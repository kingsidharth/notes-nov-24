import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppLayout } from "./routes/app-layout";
import { HomeRoute } from "./routes/home-route";
import { NotFoundRoute } from "./routes/not-found-route";
import { NoteRoute } from "./routes/note-route";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: "notes/:id", element: <NoteRoute /> },
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
