import React from 'react';
import { WNTRMainInterface } from './WNTRMainInterface';

/**
 * HydraulicProjectsPanel - Wrapper component for hydraulic simulation projects
 * This component integrates the full WNTR interface with project management
 */
export const HydraulicProjectsPanel: React.FC = () => {
    return (
        <div className="h-full w-full">
            <WNTRMainInterface />
        </div>
    );
};
