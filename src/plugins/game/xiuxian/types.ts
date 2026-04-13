export interface XiuxianIdentity {
    platform: 'wechat';
    userId: string;
}

export type XiuxianCommand =
    | {type: 'create'; name?: string}
    | {type: 'status'}
    | {type: 'cultivate'; times?: number}
    | {type: 'explore'}
    | {type: 'bag'; page?: number; filter?: string}
    | {type: 'equip'; itemId: number}
    | {type: 'unequip'; slot: EquipmentSlot}
    | {type: 'challenge'}
    | {type: 'battleLog'; page?: number}
    | {type: 'battleDetail'; battleId: number}
    | {type: 'shop'}
    | {type: 'buy'; offerId: number}
    | {type: 'sell'; itemId: number}
    | {type: 'ledger'; limit?: number}
    | {type: 'help'};

export type EquipmentSlot = 'weapon' | 'armor' | 'accessory' | 'sutra';

export interface XiuxianPlayer {
    id: number;
    platform: string;
    userId: string;
    userName: string;
    level: number;
    exp: number;
    hp: number;
    maxHp: number;
    attack: number;
    defense: number;
    dodge: number;
    crit: number;
    spiritStone: number;
    cultivation: number;
    backpackCap: number;
    weaponItemId: number | null;
    armorItemId: number | null;
    accessoryItemId: number | null;
    sutraItemId: number | null;
    createdAt: number;
    updatedAt: number;
    version: number;
}

export interface XiuxianItem {
    id: number;
    playerId: number;
    itemType: EquipmentSlot;
    itemName: string;
    itemLevel: number;
    quality: string;
    attack: number;
    defense: number;
    hp: number;
    dodge: number;
    crit: number;
    score: number;
    isLocked: number;
    createdAt: number;
}

export interface XiuxianBattle {
    id: number;
    playerId: number;
    enemyName: string;
    enemyLevel: number;
    result: 'win' | 'lose';
    rounds: number;
    rewardJson: string;
    battleLog: string;
    createdAt: number;
}

export interface XiuxianShopOffer {
    id: number;
    playerId: number;
    offerKey: string;
    itemPayloadJson: string;
    priceSpiritStone: number;
    stock: number;
    status: 'active' | 'sold' | 'expired';
    refreshedAt: number;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
}

export interface XiuxianEconomyLog {
    id: number;
    playerId: number;
    bizType: 'buy' | 'sell' | 'reward' | 'cost' | 'other';
    deltaSpiritStone: number;
    balanceAfter: number;
    refType: string;
    refId: number | null;
    idempotencyKey: string | null;
    extraJson: string;
    createdAt: number;
}

export interface XiuxianBagQuery {
    itemType?: EquipmentSlot;
    quality?: 'common' | 'rare' | 'epic';
    sort?: XiuxianBagSort;
}

export type XiuxianBagSort = 'id_desc' | 'score_desc' | 'score_asc';

export interface CooldownState {
    action: string;
    nextAt: number;
    dayKey: string;
    dayCount: number;
    updatedAt: number;
}

export interface CombatPower {
    attack: number;
    defense: number;
    maxHp: number;
    dodge: number;
    crit: number;
}

