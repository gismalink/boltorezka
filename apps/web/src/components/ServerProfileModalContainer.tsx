import type { ComponentProps } from "react";
import { ServerProfileModal } from "./ServerProfileModal";

type ServerProfileModalContainerProps = ComponentProps<typeof ServerProfileModal>;

export function ServerProfileModalContainer(props: ServerProfileModalContainerProps) {
  return <ServerProfileModal {...props} />;
}
