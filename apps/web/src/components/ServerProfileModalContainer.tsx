/**
 * ServerProfileModalContainer.tsx — легкий контейнер над ServerProfileModal.
 * Рендерит модаль только когда она должна быть открыта — хранит React от рендера тяжёлого дерева.
 */
import type { ComponentProps } from "react";
import { ServerProfileModal } from "./ServerProfileModal";

type ServerProfileModalContainerProps = ComponentProps<typeof ServerProfileModal>;

export function ServerProfileModalContainer(props: ServerProfileModalContainerProps) {
  return <ServerProfileModal {...props} />;
}
