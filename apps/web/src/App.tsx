import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { RequireAuth } from "./features/auth/require-auth";
import { AppLayout } from "./routes/app-layout";
import { HomeRoute } from "./routes/home-route";
import { NotFoundRoute } from "./routes/not-found-route";
import { NoteRoute } from "./routes/note-route";
import { RootLayout } from "./routes/root-layout";
import { SignInRoute } from "./routes/sign-in-route";
import { SignUpRoute } from "./routes/sign-up-route";

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      // `/*`: Clerk's multi-step flows (verify email, factor two…) live under these paths.
      { path: "sign-in/*", element: <SignInRoute /> },
      { path: "sign-up/*", element: <SignUpRoute /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: "/",
            element: <AppLayout />,
            children: [
              { index: true, element: <HomeRoute /> },
              { path: "notes/:id", element: <NoteRoute /> },
              { path: "*", element: <NotFoundRoute /> },
            ],
          },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
