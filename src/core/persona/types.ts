export type Persona = {
    roleKey: string;
    category: string;
    name: string;
    triggers: string[];
    instruction: string;
    ack: string;
};

export const NORMAL_ID = 'normal';
