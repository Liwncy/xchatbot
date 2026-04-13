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
    | {type: 'checkin'}
    | {type: 'task'; onlyClaimable?: boolean}
    | {type: 'claim'; taskId?: number; claimAll?: boolean}
    | {type: 'achievement'}
    | {type: 'bossRaid'}
    | {type: 'bossStatus'}
    | {type: 'bossRank'; limit?: number; selfOnly?: boolean}
    | {type: 'bossLog'; page?: number}
    | {type: 'bossDetail'; logId: number}
    | {type: 'towerClimb'}
    | {type: 'towerStatus'}
    | {type: 'towerRank'; limit?: number; selfOnly?: boolean}
    | {type: 'towerLog'; page?: number}
    | {type: 'towerDetail'; logId: number}
    | {type: 'towerSeasonKey'}
    | {type: 'towerSeasonRank'; limit?: number; selfOnly?: boolean}
    | {type: 'towerSeasonStatus'}
    | {type: 'towerSeasonReward'}
    | {type: 'towerSeasonClaim'}
    | {type: 'petAdopt'}
    | {type: 'petStatus'}
    | {type: 'petFeed'}
    | {type: 'petDeploy'}
    | {type: 'petRest'}
    | {type: 'help'; topic?: string};

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

export interface XiuxianCheckin {
    id: number;
    playerId: number;
    dayKey: string;
    rewardSpiritStone: number;
    rewardExp: number;
    rewardCultivation: number;
    createdAt: number;
}

export type XiuxianTaskType = 'daily';

export interface XiuxianTaskDef {
    id: number;
    code: string;
    title: string;
    description: string;
    taskType: XiuxianTaskType;
    targetValue: number;
    requirementJson: string;
    rewardJson: string;
    sortOrder: number;
    isActive: number;
    createdAt: number;
    updatedAt: number;
}

export interface XiuxianPlayerTask {
    id: number;
    playerId: number;
    taskId: number;
    dayKey: string;
    progressValue: number;
    targetValue: number;
    status: 'in_progress' | 'claimable' | 'claimed';
    claimedAt: number | null;
    updatedAt: number;
}

export interface XiuxianAchievementDef {
    id: number;
    code: string;
    title: string;
    description: string;
    targetValue: number;
    requirementJson: string;
    rewardJson: string;
    sortOrder: number;
    isActive: number;
    createdAt: number;
    updatedAt: number;
}

export interface XiuxianPlayerAchievement {
    id: number;
    playerId: number;
    achievementId: number;
    progressValue: number;
    targetValue: number;
    status: 'in_progress' | 'claimable' | 'claimed';
    unlockedAt: number | null;
    claimedAt: number | null;
    updatedAt: number;
}

export interface XiuxianBossState {
    id: number;
    playerId: number;
    bossName: string;
    bossLevel: number;
    maxHp: number;
    currentHp: number;
    status: 'alive' | 'defeated';
    rounds: number;
    lastResult: 'win' | 'lose';
    rewardJson: string;
    startedAt: number;
    updatedAt: number;
}

export interface XiuxianBossLog {
    id: number;
    playerId: number;
    bossName: string;
    bossLevel: number;
    result: 'win' | 'lose';
    rounds: number;
    rewardJson: string;
    battleLog: string;
    createdAt: number;
}

export interface XiuxianWorldBossState {
    id: number;
    scopeKey: string;
    cycleNo: number;
    bossName: string;
    bossLevel: number;
    maxHp: number;
    currentHp: number;
    status: 'alive' | 'defeated';
    version: number;
    lastHitUserId: string | null;
    startedAt: number;
    updatedAt: number;
    defeatedAt: number | null;
}

export interface XiuxianWorldBossContribution {
    playerId: number;
    userName?: string;
    totalDamage: number;
    attacks: number;
    killCount: number;
    rank?: number;
}

export interface XiuxianTowerProgress {
    playerId: number;
    highestFloor: number;
    lastResult: 'win' | 'lose' | null;
    lastRewardJson: string;
    updatedAt: number;
}

export interface XiuxianTowerLog {
    id: number;
    playerId: number;
    floor: number;
    result: 'win' | 'lose';
    rounds: number;
    rewardJson: string;
    battleLog: string;
    createdAt: number;
}

export interface XiuxianTowerRankRow {
    playerId: number;
    userName?: string;
    highestFloor: number;
    updatedAt: number;
    rank?: number;
}

export interface XiuxianTowerSeasonRankRow {
    seasonKey: string;
    playerId: number;
    userName?: string;
    highestFloor: number;
    updatedAt: number;
    rank?: number;
}

export interface XiuxianPet {
    id: number;
    playerId: number;
    petName: string;
    petType: string;
    level: number;
    affection: number;
    feedCount: number;
    lastFedDay: string | null;
    inBattle: number;
    createdAt: number;
    updatedAt: number;
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

