import React from 'react';
import { WNTRMainInterface } from './WNTRMainInterface';

/**
 * Raíz de la navegación (#35): la lista de proyectos, siempre, haya proyecto
 * activo o no. Con `modo="red"` este mismo componente es la vista de trabajo
 * sobre el proyecto, que es lo que enseñaba también aquí y dejaba la lista
 * inalcanzable sin cerrar antes el proyecto.
 */
export const HydraulicProjectsPanel: React.FC = () => {
    return (
        <div className="h-full w-full">
            <WNTRMainInterface modo="proyectos" />
        </div>
    );
};
