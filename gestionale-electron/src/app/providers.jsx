import { RouterProvider } from "react-router-dom";
import { appRouter } from "./router";

export function AppProviders() {
  return <RouterProvider router={appRouter} />;
}
