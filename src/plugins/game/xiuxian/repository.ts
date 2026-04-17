import type {
    XiuxianAchievementDef,
    CooldownState,
    XiuxianBossLog,
    XiuxianBossState,
    XiuxianWorldBossContribution,
    XiuxianWorldBossState,
    XiuxianCheckin,
    EquipmentSlot,
    XiuxianFortuneRecord,
    XiuxianBagQuery,
    XiuxianBagSort,
    XiuxianBattle,
    XiuxianEconomyLog,
    XiuxianIdentity,
    XiuxianItem,
    XiuxianItemQuality,
    XiuxianBond,
    XiuxianBondLog,
    XiuxianPvpMode,
    XiuxianPvpRequest,
    XiuxianNpcEncounterRecord,
    XiuxianPlayerAchievement,
    XiuxianPlayer,
    XiuxianPlayerTask,
    XiuxianPet,
    XiuxianPetBanner,
    XiuxianPetBannerEntry,
    XiuxianPetBagItem,
    XiuxianPetDrawLog,
    XiuxianPetExclusiveProfile,
    XiuxianPetPityState,
    XiuxianShopOffer,
    XiuxianTaskDef,
    XiuxianAuction,
    XiuxianAuctionBid,
    XiuxianTowerLog,
    XiuxianTowerProgress,
    XiuxianTowerRankRow,
    XiuxianTowerSeasonRankRow,
} from './types.js';

function toPlayer(row: Record<string, unknown>): XiuxianPlayer {
    return {
        id: Number(row.id),
        platform: String(row.platform),
        userId: String(row.user_id),
        userName: String(row.user_name),
        level: Number(row.level),
        exp: Number(row.exp),
        hp: Number(row.hp),
        maxHp: Number(row.max_hp),
        attack: Number(row.attack),
        defense: Number(row.defense),
        dodge: Number(row.dodge),
        crit: Number(row.crit),
        spiritStone: Number(row.spirit_stone),
        cultivation: Number(row.cultivation),
        backpackCap: Number(row.backpack_cap),
        weaponItemId: row.weapon_item_id == null ? null : Number(row.weapon_item_id),
        armorItemId: row.armor_item_id == null ? null : Number(row.armor_item_id),
        accessoryItemId: row.accessory_item_id == null ? null : Number(row.accessory_item_id),
        sutraItemId: row.sutra_item_id == null ? null : Number(row.sutra_item_id),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        version: Number(row.version),
    };
}

function toItem(row: Record<string, unknown>): XiuxianItem {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        itemType: String(row.item_type) as EquipmentSlot,
        itemName: String(row.item_name),
        itemLevel: Number(row.item_level),
        quality: String(row.quality) as XiuxianItemQuality,
        attack: Number(row.attack),
        defense: Number(row.defense),
        hp: Number(row.hp),
        dodge: Number(row.dodge),
        crit: Number(row.crit),
        score: Number(row.score),
        setKey: row.set_key == null ? undefined : String(row.set_key),
        setName: row.set_name == null ? undefined : String(row.set_name),
        isLocked: Number(row.is_locked),
        createdAt: Number(row.created_at),
    };
}

function toBattle(row: Record<string, unknown>): XiuxianBattle {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        enemyName: String(row.enemy_name),
        enemyLevel: Number(row.enemy_level),
        result: String(row.result) as 'win' | 'lose',
        rounds: Number(row.rounds),
        rewardJson: String(row.reward_json ?? '{}'),
        battleLog: String(row.battle_log ?? ''),
        createdAt: Number(row.created_at),
    };
}

function toShopOffer(row: Record<string, unknown>): XiuxianShopOffer {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        offerKey: String(row.offer_key),
        itemPayloadJson: String(row.item_payload_json),
        priceSpiritStone: Number(row.price_spirit_stone),
        stock: Number(row.stock),
        status: String(row.status) as 'active' | 'sold' | 'expired',
        refreshedAt: Number(row.refreshed_at),
        expiresAt: Number(row.expires_at),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function toEconomyLog(row: Record<string, unknown>): XiuxianEconomyLog {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        bizType: String(row.biz_type) as XiuxianEconomyLog['bizType'],
        deltaSpiritStone: Number(row.delta_spirit_stone),
        balanceAfter: Number(row.balance_after),
        refType: String(row.ref_type),
        refId: row.ref_id == null ? null : Number(row.ref_id),
        idempotencyKey: row.idempotency_key == null ? null : String(row.idempotency_key),
        extraJson: String(row.extra_json ?? '{}'),
        createdAt: Number(row.created_at),
    };
}

function toAuction(row: Record<string, unknown>): XiuxianAuction {
    return {
        id: Number(row.id),
        sellerId: Number(row.seller_id),
        sellerName: row.seller_name == null ? undefined : String(row.seller_name),
        itemPayloadJson: String(row.item_payload_json ?? '{}'),
        startPrice: Number(row.start_price),
        currentPrice: Number(row.current_price),
        currentBidderId: row.current_bidder_id == null ? null : Number(row.current_bidder_id),
        currentBidderName: row.current_bidder_name == null ? undefined : String(row.current_bidder_name),
        minIncrement: Number(row.min_increment),
        feeRateBp: Number(row.fee_rate_bp),
        status: String(row.status) as XiuxianAuction['status'],
        endAt: Number(row.end_at),
        settledAt: row.settled_at == null ? null : Number(row.settled_at),
        version: Number(row.version),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function toAuctionBid(row: Record<string, unknown>): XiuxianAuctionBid {
    return {
        id: Number(row.id),
        auctionId: Number(row.auction_id),
        bidderId: Number(row.bidder_id),
        bidderName: row.bidder_name == null ? undefined : String(row.bidder_name),
        bidPrice: Number(row.bid_price),
        idempotencyKey: row.idempotency_key == null ? null : String(row.idempotency_key),
        createdAt: Number(row.created_at),
    };
}

function toCheckin(row: Record<string, unknown>): XiuxianCheckin {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        dayKey: String(row.day_key),
        rewardSpiritStone: Number(row.reward_spirit_stone),
        rewardExp: Number(row.reward_exp),
        rewardCultivation: Number(row.reward_cultivation),
        createdAt: Number(row.created_at),
    };
}

function toTaskDef(row: Record<string, unknown>): XiuxianTaskDef {
    return {
        id: Number(row.id),
        code: String(row.code),
        title: String(row.title),
        description: String(row.description),
        taskType: String(row.task_type) as XiuxianTaskDef['taskType'],
        targetValue: Number(row.target_value),
        requirementJson: String(row.requirement_json ?? '{}'),
        rewardJson: String(row.reward_json ?? '{}'),
        sortOrder: Number(row.sort_order),
        isActive: Number(row.is_active),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function toPlayerTask(row: Record<string, unknown>): XiuxianPlayerTask {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        taskId: Number(row.task_id),
        dayKey: String(row.day_key),
        progressValue: Number(row.progress_value),
        targetValue: Number(row.target_value),
        status: String(row.status) as XiuxianPlayerTask['status'],
        claimedAt: row.claimed_at == null ? null : Number(row.claimed_at),
        updatedAt: Number(row.updated_at),
    };
}

function toAchievementDef(row: Record<string, unknown>): XiuxianAchievementDef {
    return {
        id: Number(row.id),
        code: String(row.code),
        title: String(row.title),
        description: String(row.description),
        targetValue: Number(row.target_value),
        requirementJson: String(row.requirement_json ?? '{}'),
        rewardJson: String(row.reward_json ?? '{}'),
        sortOrder: Number(row.sort_order),
        isActive: Number(row.is_active),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function toPlayerAchievement(row: Record<string, unknown>): XiuxianPlayerAchievement {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        achievementId: Number(row.achievement_id),
        progressValue: Number(row.progress_value),
        targetValue: Number(row.target_value),
        status: String(row.status) as XiuxianPlayerAchievement['status'],
        unlockedAt: row.unlocked_at == null ? null : Number(row.unlocked_at),
        claimedAt: row.claimed_at == null ? null : Number(row.claimed_at),
        updatedAt: Number(row.updated_at),
    };
}

function toBossState(row: Record<string, unknown>): XiuxianBossState {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        bossName: String(row.boss_name),
        bossLevel: Number(row.boss_level),
        maxHp: Number(row.max_hp),
        currentHp: Number(row.current_hp),
        status: String(row.status) as XiuxianBossState['status'],
        rounds: Number(row.rounds),
        lastResult: String(row.last_result) as XiuxianBossState['lastResult'],
        rewardJson: String(row.reward_json ?? '{}'),
        startedAt: Number(row.started_at),
        updatedAt: Number(row.updated_at),
    };
}

function toBossLog(row: Record<string, unknown>): XiuxianBossLog {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        bossName: String(row.boss_name),
        bossLevel: Number(row.boss_level),
        result: String(row.result) as XiuxianBossLog['result'],
        rounds: Number(row.rounds),
        rewardJson: String(row.reward_json ?? '{}'),
        battleLog: String(row.battle_log ?? ''),
        createdAt: Number(row.created_at),
    };
}

function toWorldBossState(row: Record<string, unknown>): XiuxianWorldBossState {
    return {
        id: Number(row.id),
        scopeKey: String(row.scope_key),
        cycleNo: Number(row.cycle_no),
        bossName: String(row.boss_name),
        bossLevel: Number(row.boss_level),
        maxHp: Number(row.max_hp),
        currentHp: Number(row.current_hp),
        status: String(row.status) as XiuxianWorldBossState['status'],
        version: Number(row.version),
        lastHitUserId: row.last_hit_user_id == null ? null : String(row.last_hit_user_id),
        startedAt: Number(row.started_at),
        updatedAt: Number(row.updated_at),
        defeatedAt: row.defeated_at == null ? null : Number(row.defeated_at),
    };
}

function toWorldBossContribution(row: Record<string, unknown>): XiuxianWorldBossContribution {
    return {
        playerId: Number(row.player_id),
        userName: row.user_name == null ? undefined : String(row.user_name),
        totalDamage: Number(row.total_damage),
        attacks: Number(row.attacks),
        killCount: Number(row.kill_count),
        rank: row.rank == null ? undefined : Number(row.rank),
    };
}

function toTowerProgress(row: Record<string, unknown>): XiuxianTowerProgress {
    return {
        playerId: Number(row.player_id),
        highestFloor: Number(row.highest_floor),
        lastResult: row.last_result == null ? null : (String(row.last_result) as 'win' | 'lose'),
        lastRewardJson: String(row.last_reward_json ?? '{}'),
        updatedAt: Number(row.updated_at),
    };
}

function toTowerLog(row: Record<string, unknown>): XiuxianTowerLog {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        floor: Number(row.floor),
        result: String(row.result) as 'win' | 'lose',
        rounds: Number(row.rounds),
        rewardJson: String(row.reward_json ?? '{}'),
        battleLog: String(row.battle_log ?? ''),
        createdAt: Number(row.created_at),
    };
}

function toTowerRankRow(row: Record<string, unknown>): XiuxianTowerRankRow {
    return {
        playerId: Number(row.player_id),
        userName: row.user_name == null ? undefined : String(row.user_name),
        highestFloor: Number(row.highest_floor),
        updatedAt: Number(row.updated_at),
        rank: row.rank == null ? undefined : Number(row.rank),
    };
}

function toTowerSeasonRankRow(row: Record<string, unknown>): XiuxianTowerSeasonRankRow {
    return {
        seasonKey: String(row.season_key),
        playerId: Number(row.player_id),
        userName: row.user_name == null ? undefined : String(row.user_name),
        highestFloor: Number(row.highest_floor),
        updatedAt: Number(row.updated_at),
        rank: row.rank == null ? undefined : Number(row.rank),
    };
}

function toPet(row: Record<string, unknown>): XiuxianPet {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        petName: String(row.pet_name),
        petType: String(row.pet_type),
        level: Number(row.level),
        exp: Number(row.exp ?? 0),
        affection: Number(row.affection),
        feedCount: Number(row.feed_count),
        lastFedDay: row.last_fed_day == null ? null : String(row.last_fed_day),
        inBattle: Number(row.in_battle ?? 1),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function toPetBagItem(row: Record<string, unknown>): XiuxianPetBagItem {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        itemKey: String(row.item_key),
        itemName: String(row.item_name),
        feedLevel: Number(row.feed_level),
        feedAffection: Number(row.feed_affection),
        quantity: Number(row.quantity),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function toPetBanner(row: Record<string, unknown>): XiuxianPetBanner {
    return {
        id: Number(row.id),
        bannerKey: String(row.banner_key),
        title: String(row.title),
        status: String(row.status) as XiuxianPetBanner['status'],
        startAt: Number(row.start_at),
        endAt: Number(row.end_at),
        drawCost: Number(row.draw_cost),
        hardPityUr: Number(row.hard_pity_ur),
        hardPityUp: Number(row.hard_pity_up),
        upPetName: row.up_pet_name == null ? null : String(row.up_pet_name),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function toPetBannerEntry(row: Record<string, unknown>): XiuxianPetBannerEntry {
    return {
        id: Number(row.id),
        bannerId: Number(row.banner_id),
        petName: String(row.pet_name),
        petType: String(row.pet_type),
        rarity: String(row.rarity) as XiuxianPetBannerEntry['rarity'],
        weight: Number(row.weight),
        isUp: Number(row.is_up),
    };
}

function toPetPityState(row: Record<string, unknown>): XiuxianPetPityState {
    return {
        playerId: Number(row.player_id),
        bannerKey: String(row.banner_key),
        totalDraws: Number(row.total_draws),
        sinceUr: Number(row.since_ur),
        sinceUp: Number(row.since_up),
        updatedAt: Number(row.updated_at),
    };
}

function toPetExclusiveProfile(row: Record<string, unknown>): XiuxianPetExclusiveProfile {
    return {
        id: Number(row.id),
        petName: String(row.pet_name),
        exclusiveTrait: String(row.exclusive_trait ?? ''),
        skillName: String(row.skill_name ?? ''),
        skillDesc: String(row.skill_desc ?? ''),
        updatedAt: Number(row.updated_at ?? 0),
    };
}

function toNpcEncounter(row: Record<string, unknown>): XiuxianNpcEncounterRecord {
    return {
        id: Number(row.id),
        playerId: Number(row.player_id),
        dayKey: String(row.day_key),
        eventCode: String(row.event_code),
        eventTitle: String(row.event_title),
        eventTier: String(row.event_tier),
        rewardJson: String(row.reward_json ?? '{}'),
        createdAt: Number(row.created_at),
    };
}

function toBond(row: Record<string, unknown>): XiuxianBond {
    return {
        id: Number(row.id),
        requesterId: Number(row.requester_id),
        targetId: Number(row.target_id),
        status: String(row.status) as XiuxianBond['status'],
        intimacy: Number(row.intimacy),
        level: Number(row.level),
        lastTravelDay: row.last_travel_day == null ? null : String(row.last_travel_day),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function toBondLog(row: Record<string, unknown>): XiuxianBondLog {
    return {
        id: Number(row.id),
        bondId: Number(row.bond_id),
        playerId: Number(row.player_id),
        action: String(row.action),
        deltaIntimacy: Number(row.delta_intimacy),
        rewardJson: String(row.reward_json ?? '{}'),
        createdAt: Number(row.created_at),
    };
}

function toPvpRequest(row: Record<string, unknown>): XiuxianPvpRequest {
    return {
        id: Number(row.id),
        requesterId: Number(row.requester_id),
        targetId: Number(row.target_id),
        mode: String(row.mode) as XiuxianPvpMode,
        status: String(row.status) as XiuxianPvpRequest['status'],
        expiresAt: Number(row.expires_at),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
    };
}

function changedRows(result: D1Result<unknown>): number {
    const meta = (result.meta ?? {}) as Record<string, unknown>;
    return Number(meta.changes ?? 0);
}

function chinaDayKey(now: number): string {
    return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function buildBagWhere(filter?: XiuxianBagQuery): {sql: string; args: unknown[]} {
    const clauses: string[] = [];
    const args: unknown[] = [];
    if (filter?.itemType) {
        clauses.push('item_type = ?');
        args.push(filter.itemType);
    }
    if (filter?.quality) {
        clauses.push('quality = ?');
        args.push(filter.quality);
    }
    return {
        sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '',
        args,
    };
}

function buildBagOrder(sort?: XiuxianBagSort): string {
    if (sort === 'score_desc') return 'ORDER BY score DESC, id DESC';
    if (sort === 'score_asc') return 'ORDER BY score ASC, id DESC';
    return 'ORDER BY id DESC';
}

export class XiuxianRepository {
    constructor(private readonly db: D1Database) {}

    async findPlayer(identity: XiuxianIdentity): Promise<XiuxianPlayer | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_players
                 WHERE platform = ?1 AND user_id = ?2
                 LIMIT 1`,
            )
            .bind(identity.platform, identity.userId)
            .first<Record<string, unknown>>();
        return row ? toPlayer(row) : null;
    }

    async findPlayerById(id: number): Promise<XiuxianPlayer | null> {
        const row = await this.db
            .prepare('SELECT * FROM xiuxian_players WHERE id = ?1 LIMIT 1')
            .bind(id)
            .first<Record<string, unknown>>();
        return row ? toPlayer(row) : null;
    }

    async findPlayerNameByUserId(userId: string): Promise<string | null> {
        const row = await this.db
            .prepare(
                `SELECT user_name
                 FROM xiuxian_players
                 WHERE user_id = ?1
                 LIMIT 1`,
            )
            .bind(userId)
            .first<Record<string, unknown>>();
        if (!row?.user_name) return null;
        return String(row.user_name);
    }

    async createPlayer(identity: XiuxianIdentity, userName: string, now: number): Promise<XiuxianPlayer> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_players (
                    platform, user_id, user_name,
                    level, exp, hp, max_hp, attack, defense, dodge, crit,
                    spirit_stone, cultivation, backpack_cap,
                    created_at, updated_at, version
                ) VALUES (?1, ?2, ?3, 1, 0, 100, 100, 10, 5, 0, 0, 0, 0, 50, ?4, ?4, 0)`,
            )
            .bind(identity.platform, identity.userId, userName, now)
            .run();

        const created = await this.findPlayer(identity);
        if (!created) throw new Error('创建角色后读取失败');
        return created;
    }

    async updatePlayer(player: XiuxianPlayer, now: number): Promise<void> {
        await this.db
            .prepare(
                `UPDATE xiuxian_players
                 SET user_name = ?2,
                     level = ?3,
                     exp = ?4,
                     hp = ?5,
                     max_hp = ?6,
                     attack = ?7,
                     defense = ?8,
                     dodge = ?9,
                     crit = ?10,
                     spirit_stone = ?11,
                     cultivation = ?12,
                     backpack_cap = ?13,
                     weapon_item_id = ?14,
                     armor_item_id = ?15,
                     accessory_item_id = ?16,
                     sutra_item_id = ?17,
                     updated_at = ?18,
                     version = version + 1
                 WHERE id = ?1`,
            )
            .bind(
                player.id,
                player.userName,
                player.level,
                player.exp,
                player.hp,
                player.maxHp,
                player.attack,
                player.defense,
                player.dodge,
                player.crit,
                player.spiritStone,
                player.cultivation,
                player.backpackCap,
                player.weaponItemId,
                player.armorItemId,
                player.accessoryItemId,
                player.sutraItemId,
                now,
            )
            .run();
    }

    async listInventory(playerId: number, page: number, pageSize: number, filter?: XiuxianBagQuery): Promise<XiuxianItem[]> {
        const offset = (page - 1) * pageSize;
        const where = buildBagWhere(filter);
        const orderSql = buildBagOrder(filter?.sort);
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_inventory
                 WHERE player_id = ?
                 ${where.sql}
                 ${orderSql}
                 LIMIT ? OFFSET ?`,
            )
            .bind(playerId, ...where.args, pageSize, offset)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toItem);
    }

    async countInventory(playerId: number, filter?: XiuxianBagQuery): Promise<number> {
        const where = buildBagWhere(filter);
        const row = await this.db
            .prepare(`SELECT COUNT(1) AS cnt FROM xiuxian_inventory WHERE player_id = ? ${where.sql}`)
            .bind(playerId, ...where.args)
            .first<Record<string, unknown>>();
        return Number(row?.cnt ?? 0);
    }

    async findItem(playerId: number, itemId: number): Promise<XiuxianItem | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_inventory
                 WHERE player_id = ?1 AND id = ?2
                 LIMIT 1`,
            )
            .bind(playerId, itemId)
            .first<Record<string, unknown>>();
        return row ? toItem(row) : null;
    }

    async addItem(playerId: number, item: Omit<XiuxianItem, 'id' | 'playerId' | 'createdAt'>, now: number): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_inventory (
                    player_id, item_type, item_name, item_level, quality,
                    attack, defense, hp, dodge, crit, score, set_key, set_name, is_locked, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
            )
            .bind(
                playerId,
                item.itemType,
                item.itemName,
                item.itemLevel,
                item.quality,
                item.attack,
                item.defense,
                item.hp,
                item.dodge,
                item.crit,
                item.score,
                item.setKey ?? null,
                item.setName ?? null,
                item.isLocked,
                now,
            )
            .run();
    }

    async getEquippedItems(player: XiuxianPlayer): Promise<XiuxianItem[]> {
        const ids = [player.weaponItemId, player.armorItemId, player.accessoryItemId, player.sutraItemId].filter(
            (v): v is number => typeof v === 'number',
        );
        if (!ids.length) return [];
        const placeholders = ids.map(() => '?').join(',');
        const stmt = this.db.prepare(
            `SELECT * FROM xiuxian_inventory
             WHERE player_id = ? AND id IN (${placeholders})`,
        );
        const rows = await stmt.bind(player.id, ...ids).all<Record<string, unknown>>();
        return (rows.results ?? []).map(toItem);
    }

    async setCooldown(playerId: number, action: string, nextAt: number, now: number): Promise<void> {
        const dayKey = chinaDayKey(now);
        await this.db
            .prepare(
                `INSERT INTO xiuxian_cooldowns (player_id, action, next_at, day_key, day_count, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 1, ?5)
                 ON CONFLICT(player_id, action)
                 DO UPDATE SET
                    next_at = excluded.next_at,
                    day_key = excluded.day_key,
                    day_count = CASE
                        WHEN xiuxian_cooldowns.day_key = excluded.day_key THEN xiuxian_cooldowns.day_count + 1
                        ELSE 1
                    END,
                    updated_at = excluded.updated_at`,
            )
            .bind(playerId, action, nextAt, dayKey, now)
            .run();
    }

    async countBattleWins(playerId: number): Promise<number> {
        const row = await this.db
            .prepare(
                `SELECT COUNT(1) AS cnt
                 FROM xiuxian_battles
                 WHERE player_id = ?1 AND result = 'win'`,
            )
            .bind(playerId)
            .first<Record<string, unknown>>();
        return Number(row?.cnt ?? 0);
    }

    async getCooldown(playerId: number, action: string): Promise<CooldownState | null> {
        const row = await this.db
            .prepare(
                `SELECT action, next_at, day_key, day_count, updated_at
                 FROM xiuxian_cooldowns
                 WHERE player_id = ?1 AND action = ?2
                 LIMIT 1`,
            )
            .bind(playerId, action)
            .first<Record<string, unknown>>();
        if (!row) return null;
        return {
            action: String(row.action),
            nextAt: Number(row.next_at),
            dayKey: String(row.day_key),
            dayCount: Number(row.day_count),
            updatedAt: Number(row.updated_at),
        };
    }

    async addBattleLog(
        playerId: number,
        enemyName: string,
        enemyLevel: number,
        result: 'win' | 'lose',
        rounds: number,
        rewardJson: string,
        battleLog: string,
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_battles (
                    player_id, enemy_name, enemy_level, result, rounds, reward_json, battle_log, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
            )
            .bind(playerId, enemyName, enemyLevel, result, rounds, rewardJson, battleLog, now)
            .run();
    }

    async listBattles(playerId: number, page: number, pageSize: number): Promise<XiuxianBattle[]> {
        const offset = (page - 1) * pageSize;
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_battles
                 WHERE player_id = ?1
                 ORDER BY id DESC
                 LIMIT ?2 OFFSET ?3`,
            )
            .bind(playerId, pageSize, offset)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toBattle);
    }

    async findBattle(playerId: number, battleId: number): Promise<XiuxianBattle | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_battles
                 WHERE player_id = ?1 AND id = ?2
                 LIMIT 1`,
            )
            .bind(playerId, battleId)
            .first<Record<string, unknown>>();
        return row ? toBattle(row) : null;
    }

    async listShopOffers(playerId: number, now: number): Promise<XiuxianShopOffer[]> {
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_shop_offers
                 WHERE player_id = ?1
                   AND status = 'active'
                   AND expires_at > ?2
                 ORDER BY id ASC`,
            )
            .bind(playerId, now)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toShopOffer);
    }

    async clearShopOffers(playerId: number): Promise<void> {
        await this.db.prepare('DELETE FROM xiuxian_shop_offers WHERE player_id = ?1').bind(playerId).run();
    }

    async createShopOffer(
        playerId: number,
        offer: {offerKey: string; itemPayloadJson: string; priceSpiritStone: number; stock: number; refreshedAt: number; expiresAt: number},
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_shop_offers (
                    player_id, offer_key, item_payload_json, price_spirit_stone,
                    stock, status, refreshed_at, expires_at, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?6, ?7, ?8, ?8)`,
            )
            .bind(playerId, offer.offerKey, offer.itemPayloadJson, offer.priceSpiritStone, offer.stock, offer.refreshedAt, offer.expiresAt, now)
            .run();
    }

    async createAuction(input: {
        sellerId: number;
        itemPayloadJson: string;
        startPrice: number;
        minIncrement: number;
        feeRateBp: number;
        endAt: number;
        now: number;
    }): Promise<number> {
        const result = await this.db
            .prepare(
                `INSERT INTO xiuxian_auctions (
                    seller_id, item_payload_json, start_price, current_price, current_bidder_id,
                    min_increment, fee_rate_bp, status, end_at, settled_at, version, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?3, NULL, ?4, ?5, 'active', ?6, NULL, 0, ?7, ?7)`,
            )
            .bind(input.sellerId, input.itemPayloadJson, input.startPrice, input.minIncrement, input.feeRateBp, input.endAt, input.now)
            .run();
        const inserted = Number((result.meta as Record<string, unknown> | undefined)?.last_row_id ?? 0);
        if (inserted > 0) return inserted;
        const row = await this.db
            .prepare('SELECT id FROM xiuxian_auctions WHERE seller_id = ?1 ORDER BY id DESC LIMIT 1')
            .bind(input.sellerId)
            .first<Record<string, unknown>>();
        return Number(row?.id ?? 0);
    }

    async findAuctionById(auctionId: number): Promise<XiuxianAuction | null> {
        const row = await this.db
            .prepare(
                `SELECT a.*, sp.user_name AS seller_name, bp.user_name AS current_bidder_name
                 FROM xiuxian_auctions a
                 LEFT JOIN xiuxian_players sp ON sp.id = a.seller_id
                 LEFT JOIN xiuxian_players bp ON bp.id = a.current_bidder_id
                 WHERE a.id = ?1
                 LIMIT 1`,
            )
            .bind(auctionId)
            .first<Record<string, unknown>>();
        return row ? toAuction(row) : null;
    }

    async listActiveAuctions(page: number, pageSize: number, now: number): Promise<XiuxianAuction[]> {
        const offset = (page - 1) * pageSize;
        const rows = await this.db
            .prepare(
                `SELECT a.*, sp.user_name AS seller_name, bp.user_name AS current_bidder_name
                 FROM xiuxian_auctions a
                 LEFT JOIN xiuxian_players sp ON sp.id = a.seller_id
                 LEFT JOIN xiuxian_players bp ON bp.id = a.current_bidder_id
                 WHERE a.status = 'active' AND a.end_at > ?1
                 ORDER BY a.end_at ASC, a.id DESC
                 LIMIT ?2 OFFSET ?3`,
            )
            .bind(now, pageSize, offset)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toAuction);
    }

    async listDueActiveAuctions(now: number, limit: number): Promise<XiuxianAuction[]> {
        const rows = await this.db
            .prepare(
                `SELECT a.*, sp.user_name AS seller_name, bp.user_name AS current_bidder_name
                 FROM xiuxian_auctions a
                 LEFT JOIN xiuxian_players sp ON sp.id = a.seller_id
                 LEFT JOIN xiuxian_players bp ON bp.id = a.current_bidder_id
                 WHERE a.status = 'active' AND a.end_at <= ?1
                 ORDER BY a.end_at ASC, a.id ASC
                 LIMIT ?2`,
            )
            .bind(now, limit)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toAuction);
    }

    async findAuctionBidByIdempotency(auctionId: number, idempotencyKey: string): Promise<XiuxianAuctionBid | null> {
        const row = await this.db
            .prepare(
                `SELECT b.*, p.user_name AS bidder_name
                 FROM xiuxian_auction_bids b
                 LEFT JOIN xiuxian_players p ON p.id = b.bidder_id
                 WHERE b.auction_id = ?1 AND b.idempotency_key = ?2
                 LIMIT 1`,
            )
            .bind(auctionId, idempotencyKey)
            .first<Record<string, unknown>>();
        return row ? toAuctionBid(row) : null;
    }

    async placeAuctionBid(input: {
        auctionId: number;
        bidderId: number;
        bidPrice: number;
        expectedVersion: number;
        idempotencyKey?: string;
        now: number;
    }): Promise<boolean> {
        const updateResult = await this.db
            .prepare(
                `UPDATE xiuxian_auctions
                 SET current_price = ?3,
                     current_bidder_id = ?2,
                     version = version + 1,
                     updated_at = ?4
                 WHERE id = ?1
                   AND status = 'active'
                   AND version = ?5`,
            )
            .bind(input.auctionId, input.bidderId, input.bidPrice, input.now, input.expectedVersion)
            .run();
        if (changedRows(updateResult) <= 0) return false;
        await this.db
            .prepare(
                `INSERT INTO xiuxian_auction_bids (
                    auction_id, bidder_id, bid_price, idempotency_key, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5)`,
            )
            .bind(input.auctionId, input.bidderId, input.bidPrice, input.idempotencyKey ?? null, input.now)
            .run();
        return true;
    }

    async listAuctionBids(auctionId: number, limit: number): Promise<XiuxianAuctionBid[]> {
        const rows = await this.db
            .prepare(
                `SELECT b.*, p.user_name AS bidder_name
                 FROM xiuxian_auction_bids b
                 LEFT JOIN xiuxian_players p ON p.id = b.bidder_id
                 WHERE b.auction_id = ?1
                 ORDER BY b.id DESC
                 LIMIT ?2`,
            )
            .bind(auctionId, limit)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toAuctionBid);
    }

    async cancelAuctionNoBid(auctionId: number, sellerId: number, now: number): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_auctions
                 SET status = 'cancelled',
                     settled_at = ?3,
                     updated_at = ?3,
                     version = version + 1
                 WHERE id = ?1
                   AND seller_id = ?2
                   AND status = 'active'
                   AND current_bidder_id IS NULL`,
            )
            .bind(auctionId, sellerId, now)
            .run();
        return changedRows(result) > 0;
    }

    async settleAuctionByVersion(auctionId: number, expectedVersion: number, status: 'settled' | 'expired', now: number): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_auctions
                 SET status = ?3,
                     settled_at = ?4,
                     updated_at = ?4,
                     version = version + 1
                 WHERE id = ?1
                   AND status = 'active'
                   AND version = ?2`,
            )
            .bind(auctionId, expectedVersion, status, now)
            .run();
        return changedRows(result) > 0;
    }

    async addAuctionSettlement(input: {
        auctionId: number;
        sellerId: number;
        winnerId: number | null;
        finalPrice: number;
        feeAmount: number;
        sellerReceive: number;
        result: 'sold' | 'expired' | 'cancelled';
        detailJson: string;
        now: number;
    }): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_auction_settlements (
                    auction_id, seller_id, winner_id, final_price, fee_amount, seller_receive, result, detail_json, settled_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
            )
            .bind(
                input.auctionId,
                input.sellerId,
                input.winnerId,
                input.finalPrice,
                input.feeAmount,
                input.sellerReceive,
                input.result,
                input.detailJson,
                input.now,
            )
            .run();
    }

    async findShopOffer(playerId: number, offerId: number): Promise<XiuxianShopOffer | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_shop_offers
                 WHERE player_id = ?1 AND id = ?2
                 LIMIT 1`,
            )
            .bind(playerId, offerId)
            .first<Record<string, unknown>>();
        return row ? toShopOffer(row) : null;
    }

    async markOfferSold(playerId: number, offerId: number, now: number): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_shop_offers
                 SET stock = stock - 1,
                     status = CASE WHEN stock - 1 <= 0 THEN 'sold' ELSE status END,
                     updated_at = ?3
                 WHERE player_id = ?1 AND id = ?2
                   AND status = 'active'
                   AND stock > 0`,
            )
            .bind(playerId, offerId, now)
            .run();
        return changedRows(result) > 0;
    }

    async restoreOfferStock(playerId: number, offerId: number, now: number): Promise<void> {
        await this.db
            .prepare(
                `UPDATE xiuxian_shop_offers
                 SET stock = stock + 1,
                     status = 'active',
                     updated_at = ?3
                 WHERE player_id = ?1 AND id = ?2`,
            )
            .bind(playerId, offerId, now)
            .run();
    }

    async spendSpiritStone(playerId: number, amount: number, now: number): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_players
                 SET spirit_stone = spirit_stone - ?2,
                     updated_at = ?3,
                     version = version + 1
                 WHERE id = ?1 AND spirit_stone >= ?2`,
            )
            .bind(playerId, amount, now)
            .run();
        return changedRows(result) > 0;
    }

    async gainSpiritStone(playerId: number, amount: number, now: number): Promise<void> {
        await this.db
            .prepare(
                `UPDATE xiuxian_players
                 SET spirit_stone = spirit_stone + ?2,
                     updated_at = ?3,
                     version = version + 1
                 WHERE id = ?1`,
            )
            .bind(playerId, amount, now)
            .run();
    }

    async removeItem(playerId: number, itemId: number): Promise<boolean> {
        const result = await this.db
            .prepare('DELETE FROM xiuxian_inventory WHERE player_id = ?1 AND id = ?2')
            .bind(playerId, itemId)
            .run();
        return changedRows(result) > 0;
    }

    async setItemLock(playerId: number, itemId: number, isLocked: number): Promise<boolean> {
        const lockValue = isLocked > 0 ? 1 : 0;
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_inventory
                 SET is_locked = ?3
                 WHERE player_id = ?1 AND id = ?2 AND is_locked <> ?3`,
            )
            .bind(playerId, itemId, lockValue)
            .run();
        return changedRows(result) > 0;
    }

    async getRefineMaterial(playerId: number, materialKey: string): Promise<number> {
        const row = await this.db
            .prepare(
                `SELECT quantity
                 FROM xiuxian_refine_materials
                 WHERE player_id = ?1 AND material_key = ?2
                 LIMIT 1`,
            )
            .bind(playerId, materialKey)
            .first<Record<string, unknown>>();
        return Number(row?.quantity ?? 0);
    }

    async addRefineMaterial(playerId: number, materialKey: string, amount: number, now: number): Promise<void> {
        const delta = Math.max(0, Math.floor(amount));
        if (delta <= 0) return;
        await this.db
            .prepare(
                `INSERT INTO xiuxian_refine_materials (player_id, material_key, quantity, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(player_id, material_key)
                 DO UPDATE SET
                    quantity = xiuxian_refine_materials.quantity + excluded.quantity,
                    updated_at = excluded.updated_at`,
            )
            .bind(playerId, materialKey, delta, now)
            .run();
    }

    async consumeRefineMaterial(playerId: number, materialKey: string, amount: number, now: number): Promise<boolean> {
        const delta = Math.max(1, Math.floor(amount));
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_refine_materials
                 SET quantity = quantity - ?3,
                     updated_at = ?4
                 WHERE player_id = ?1 AND material_key = ?2 AND quantity >= ?3`,
            )
            .bind(playerId, materialKey, delta, now)
            .run();
        return changedRows(result) > 0;
    }

    async findItemRefineLevel(playerId: number, itemId: number): Promise<number | null> {
        const item = await this.findItem(playerId, itemId);
        if (!item) return null;
        const row = await this.db
            .prepare(
                `SELECT refine_level
                 FROM xiuxian_item_refines
                 WHERE item_id = ?1
                 LIMIT 1`,
            )
            .bind(itemId)
            .first<Record<string, unknown>>();
        return Number(row?.refine_level ?? 0);
    }

    async listItemRefineLevels(playerId: number, itemIds: number[]): Promise<Map<number, number>> {
        const uniq = Array.from(new Set(itemIds.filter((v) => Number.isFinite(v) && v > 0)));
        if (!uniq.length) return new Map<number, number>();
        const placeholders = uniq.map(() => '?').join(',');
        const rows = await this.db
            .prepare(
                `SELECT i.id AS item_id, COALESCE(r.refine_level, 0) AS refine_level
                 FROM xiuxian_inventory i
                 LEFT JOIN xiuxian_item_refines r ON r.item_id = i.id
                 WHERE i.player_id = ?1 AND i.id IN (${placeholders})`,
            )
            .bind(playerId, ...uniq)
            .all<Record<string, unknown>>();
        const out = new Map<number, number>();
        for (const row of rows.results ?? []) {
            out.set(Number(row.item_id), Number(row.refine_level ?? 0));
        }
        return out;
    }

    async upsertItemRefineLevel(playerId: number, itemId: number, refineLevel: number, now: number): Promise<boolean> {
        const item = await this.findItem(playerId, itemId);
        if (!item) return false;
        await this.db
            .prepare(
                `INSERT INTO xiuxian_item_refines (item_id, refine_level, updated_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(item_id)
                 DO UPDATE SET
                    refine_level = excluded.refine_level,
                    updated_at = excluded.updated_at`,
            )
            .bind(itemId, Math.max(0, Math.floor(refineLevel)), now)
            .run();
        return true;
    }

    async clearItemRefine(itemId: number): Promise<void> {
        await this.db.prepare('DELETE FROM xiuxian_item_refines WHERE item_id = ?1').bind(itemId).run();
    }

    async createEconomyLog(entry: {
        playerId: number;
        bizType: XiuxianEconomyLog['bizType'];
        deltaSpiritStone: number;
        balanceAfter: number;
        refType: string;
        refId: number | null;
        idempotencyKey?: string;
        extraJson?: string;
        now: number;
    }): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_economy_logs (
                    player_id, biz_type, delta_spirit_stone, balance_after,
                    ref_type, ref_id, idempotency_key, extra_json, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
            )
            .bind(
                entry.playerId,
                entry.bizType,
                entry.deltaSpiritStone,
                entry.balanceAfter,
                entry.refType,
                entry.refId,
                entry.idempotencyKey ?? null,
                entry.extraJson ?? '{}',
                entry.now,
            )
            .run();
    }

    async findEconomyLogByIdempotency(playerId: number, idempotencyKey: string): Promise<XiuxianEconomyLog | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_economy_logs
                 WHERE player_id = ?1 AND idempotency_key = ?2
                 LIMIT 1`,
            )
            .bind(playerId, idempotencyKey)
            .first<Record<string, unknown>>();
        return row ? toEconomyLog(row) : null;
    }

    async listEconomyLogs(playerId: number, limit: number): Promise<XiuxianEconomyLog[]> {
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_economy_logs
                 WHERE player_id = ?1
                 ORDER BY id DESC
                 LIMIT ?2`,
            )
            .bind(playerId, limit)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toEconomyLog);
    }

    async findCheckin(playerId: number, dayKey: string): Promise<XiuxianCheckin | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_checkins
                 WHERE player_id = ?1 AND day_key = ?2
                 LIMIT 1`,
            )
            .bind(playerId, dayKey)
            .first<Record<string, unknown>>();
        return row ? toCheckin(row) : null;
    }

    async addCheckin(
        playerId: number,
        dayKey: string,
        reward: {spiritStone: number; exp: number; cultivation: number},
        now: number,
    ): Promise<boolean> {
        const result = await this.db
            .prepare(
                `INSERT OR IGNORE INTO xiuxian_checkins (
                    player_id, day_key, reward_spirit_stone, reward_exp, reward_cultivation, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
            )
            .bind(playerId, dayKey, reward.spiritStone, reward.exp, reward.cultivation, now)
            .run();
        return changedRows(result) > 0;
    }

    async countCheckins(playerId: number): Promise<number> {
        const row = await this.db
            .prepare('SELECT COUNT(1) AS cnt FROM xiuxian_checkins WHERE player_id = ?1')
            .bind(playerId)
            .first<Record<string, unknown>>();
        return Number(row?.cnt ?? 0);
    }

    async findFortuneByDay(playerId: number, dayKey: string): Promise<XiuxianFortuneRecord | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_fortunes
                 WHERE player_id = ?1 AND day_key = ?2
                 LIMIT 1`,
            )
            .bind(playerId, dayKey)
            .first<Record<string, unknown>>();
        if (!row) return null;
        return {
            id: Number(row.id),
            playerId: Number(row.player_id),
            dayKey: String(row.day_key),
            level: String(row.level),
            buffJson: String(row.buff_json ?? '{}'),
            signText: String(row.sign_text ?? ''),
            rerollCount: Number(row.reroll_count ?? 0),
            rerollSpent: Number(row.reroll_spent ?? 0),
            createdAt: Number(row.created_at),
            updatedAt: Number(row.updated_at),
        };
    }

    async insertFortune(entry: {
        playerId: number;
        dayKey: string;
        level: string;
        buffJson: string;
        signText: string;
        now: number;
    }): Promise<boolean> {
        const result = await this.db
            .prepare(
                `INSERT OR IGNORE INTO xiuxian_fortunes (
                    player_id, day_key, level, buff_json, sign_text,
                    reroll_count, reroll_spent, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, 0, 0, ?6, ?6)`,
            )
            .bind(entry.playerId, entry.dayKey, entry.level, entry.buffJson, entry.signText, entry.now)
            .run();
        return changedRows(result) > 0;
    }

    async rerollFortune(entry: {
        playerId: number;
        dayKey: string;
        level: string;
        buffJson: string;
        signText: string;
        extraSpent: number;
        expectedRerollCount: number;
        now: number;
    }): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_fortunes
                 SET level = ?3,
                     buff_json = ?4,
                     sign_text = ?5,
                     reroll_count = reroll_count + 1,
                     reroll_spent = reroll_spent + ?6,
                     updated_at = ?8
                 WHERE player_id = ?1 AND day_key = ?2 AND reroll_count = ?7`,
            )
            .bind(
                entry.playerId,
                entry.dayKey,
                entry.level,
                entry.buffJson,
                entry.signText,
                entry.extraSpent,
                entry.expectedRerollCount,
                entry.now,
            )
            .run();
        return changedRows(result) > 0;
    }

    async upsertTaskDef(def: {
        code: string;
        title: string;
        description: string;
        taskType: string;
        targetValue: number;
        requirementJson: string;
        rewardJson: string;
        sortOrder: number;
        now: number;
    }): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_tasks (
                    code, title, description, task_type, target_value,
                    requirement_json, reward_json, sort_order, is_active, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?9)
                ON CONFLICT(code) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    task_type = excluded.task_type,
                    target_value = excluded.target_value,
                    requirement_json = excluded.requirement_json,
                    reward_json = excluded.reward_json,
                    sort_order = excluded.sort_order,
                    is_active = 1,
                    updated_at = excluded.updated_at`,
            )
            .bind(
                def.code,
                def.title,
                def.description,
                def.taskType,
                def.targetValue,
                def.requirementJson,
                def.rewardJson,
                def.sortOrder,
                def.now,
            )
            .run();
    }

    async listTaskDefs(): Promise<XiuxianTaskDef[]> {
        const rows = await this.db
            .prepare('SELECT * FROM xiuxian_tasks WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toTaskDef);
    }

    async listPlayerTasks(playerId: number, dayKey: string): Promise<XiuxianPlayerTask[]> {
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_player_tasks
                 WHERE player_id = ?1 AND day_key = ?2`,
            )
            .bind(playerId, dayKey)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toPlayerTask);
    }

    async upsertPlayerTaskProgress(
        playerId: number,
        taskId: number,
        dayKey: string,
        progressValue: number,
        targetValue: number,
        status: XiuxianPlayerTask['status'],
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_player_tasks (
                    player_id, task_id, day_key, progress_value, target_value, status, claimed_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)
                ON CONFLICT(player_id, task_id, day_key)
                DO UPDATE SET
                    progress_value = excluded.progress_value,
                    target_value = excluded.target_value,
                    status = CASE
                        WHEN xiuxian_player_tasks.status = 'claimed' THEN 'claimed'
                        ELSE excluded.status
                    END,
                    updated_at = excluded.updated_at`,
            )
            .bind(playerId, taskId, dayKey, progressValue, targetValue, status, now)
            .run();
    }

    async markTaskClaimed(playerId: number, taskId: number, dayKey: string, now: number): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_player_tasks
                 SET status = 'claimed',
                     claimed_at = ?4,
                     updated_at = ?4
                 WHERE player_id = ?1 AND task_id = ?2 AND day_key = ?3
                   AND status = 'claimable'`,
            )
            .bind(playerId, taskId, dayKey, now)
            .run();
        return changedRows(result) > 0;
    }

    async findPlayerTask(playerId: number, taskId: number, dayKey: string): Promise<XiuxianPlayerTask | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_player_tasks
                 WHERE player_id = ?1 AND task_id = ?2 AND day_key = ?3
                 LIMIT 1`,
            )
            .bind(playerId, taskId, dayKey)
            .first<Record<string, unknown>>();
        return row ? toPlayerTask(row) : null;
    }

    async upsertAchievementDef(def: {
        code: string;
        title: string;
        description: string;
        targetValue: number;
        requirementJson: string;
        rewardJson: string;
        sortOrder: number;
        now: number;
    }): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_achievements (
                    code, title, description, target_value,
                    requirement_json, reward_json, sort_order, is_active, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)
                ON CONFLICT(code) DO UPDATE SET
                    title = excluded.title,
                    description = excluded.description,
                    target_value = excluded.target_value,
                    requirement_json = excluded.requirement_json,
                    reward_json = excluded.reward_json,
                    sort_order = excluded.sort_order,
                    is_active = 1,
                    updated_at = excluded.updated_at`,
            )
            .bind(
                def.code,
                def.title,
                def.description,
                def.targetValue,
                def.requirementJson,
                def.rewardJson,
                def.sortOrder,
                def.now,
            )
            .run();
    }

    async listAchievementDefs(): Promise<XiuxianAchievementDef[]> {
        const rows = await this.db
            .prepare('SELECT * FROM xiuxian_achievements WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toAchievementDef);
    }

    async listPlayerAchievements(playerId: number): Promise<XiuxianPlayerAchievement[]> {
        const rows = await this.db
            .prepare('SELECT * FROM xiuxian_player_achievements WHERE player_id = ?1')
            .bind(playerId)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toPlayerAchievement);
    }

    async upsertPlayerAchievementProgress(
        playerId: number,
        achievementId: number,
        progressValue: number,
        targetValue: number,
        status: XiuxianPlayerAchievement['status'],
        unlockedAt: number | null,
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_player_achievements (
                    player_id, achievement_id, progress_value, target_value, status, unlocked_at, claimed_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)
                ON CONFLICT(player_id, achievement_id)
                DO UPDATE SET
                    progress_value = excluded.progress_value,
                    target_value = excluded.target_value,
                    status = CASE
                        WHEN xiuxian_player_achievements.status = 'claimed' THEN 'claimed'
                        ELSE excluded.status
                    END,
                    unlocked_at = CASE
                        WHEN xiuxian_player_achievements.unlocked_at IS NULL THEN excluded.unlocked_at
                        ELSE xiuxian_player_achievements.unlocked_at
                    END,
                    updated_at = excluded.updated_at`,
            )
            .bind(playerId, achievementId, progressValue, targetValue, status, unlockedAt, now)
            .run();
    }

    async markAchievementClaimed(playerId: number, achievementId: number, now: number): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_player_achievements
                 SET status = 'claimed',
                     claimed_at = ?3,
                     updated_at = ?3
                 WHERE player_id = ?1 AND achievement_id = ?2
                   AND status = 'claimable'`,
            )
            .bind(playerId, achievementId, now)
            .run();
        return changedRows(result) > 0;
    }

    async findBossState(playerId: number): Promise<XiuxianBossState | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_boss_states
                 WHERE player_id = ?1
                 LIMIT 1`,
            )
            .bind(playerId)
            .first<Record<string, unknown>>();
        return row ? toBossState(row) : null;
    }

    async upsertBossState(
        playerId: number,
        input: {
            bossName: string;
            bossLevel: number;
            maxHp: number;
            currentHp: number;
            status: XiuxianBossState['status'];
            rounds: number;
            lastResult: XiuxianBossState['lastResult'];
            rewardJson: string;
            startedAt: number;
            updatedAt: number;
        },
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_boss_states (
                    player_id, boss_name, boss_level, max_hp, current_hp,
                    status, rounds, last_result, reward_json, started_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                ON CONFLICT(player_id)
                DO UPDATE SET
                    boss_name = excluded.boss_name,
                    boss_level = excluded.boss_level,
                    max_hp = excluded.max_hp,
                    current_hp = excluded.current_hp,
                    status = excluded.status,
                    rounds = excluded.rounds,
                    last_result = excluded.last_result,
                    reward_json = excluded.reward_json,
                    started_at = excluded.started_at,
                    updated_at = excluded.updated_at`,
            )
            .bind(
                playerId,
                input.bossName,
                input.bossLevel,
                input.maxHp,
                input.currentHp,
                input.status,
                input.rounds,
                input.lastResult,
                input.rewardJson,
                input.startedAt,
                input.updatedAt,
            )
            .run();
    }

    async addBossLog(
        playerId: number,
        bossName: string,
        bossLevel: number,
        result: 'win' | 'lose',
        rounds: number,
        rewardJson: string,
        battleLog: string,
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_boss_logs (
                    player_id, boss_name, boss_level, result, rounds, reward_json, battle_log, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
            )
            .bind(playerId, bossName, bossLevel, result, rounds, rewardJson, battleLog, now)
            .run();
    }

    async listBossLogs(playerId: number, page: number, pageSize: number): Promise<XiuxianBossLog[]> {
        const offset = (page - 1) * pageSize;
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_boss_logs
                 WHERE player_id = ?1
                 ORDER BY id DESC
                 LIMIT ?2 OFFSET ?3`,
            )
            .bind(playerId, pageSize, offset)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toBossLog);
    }

    async findBossLog(playerId: number, logId: number): Promise<XiuxianBossLog | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_boss_logs
                 WHERE player_id = ?1 AND id = ?2
                 LIMIT 1`,
            )
            .bind(playerId, logId)
            .first<Record<string, unknown>>();
        return row ? toBossLog(row) : null;
    }

    async findWorldBossState(scopeKey: string): Promise<XiuxianWorldBossState | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_world_boss_states
                 WHERE scope_key = ?1
                 LIMIT 1`,
            )
            .bind(scopeKey)
            .first<Record<string, unknown>>();
        return row ? toWorldBossState(row) : null;
    }

    async createWorldBossState(input: {
        scopeKey: string;
        cycleNo: number;
        bossName: string;
        bossLevel: number;
        maxHp: number;
        startedAt: number;
        now: number;
    }): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_world_boss_states (
                    scope_key, cycle_no, boss_name, boss_level,
                    max_hp, current_hp, status, version, last_hit_user_id,
                    started_at, updated_at, defeated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'alive', 0, NULL, ?6, ?7, NULL)
                ON CONFLICT(scope_key)
                DO UPDATE SET
                    cycle_no = excluded.cycle_no,
                    boss_name = excluded.boss_name,
                    boss_level = excluded.boss_level,
                    max_hp = excluded.max_hp,
                    current_hp = excluded.current_hp,
                    status = 'alive',
                    version = 0,
                    last_hit_user_id = NULL,
                    started_at = excluded.started_at,
                    updated_at = excluded.updated_at,
                    defeated_at = NULL`,
            )
            .bind(input.scopeKey, input.cycleNo, input.bossName, input.bossLevel, input.maxHp, input.startedAt, input.now)
            .run();
    }

    async attackWorldBoss(
        scopeKey: string,
        expectedVersion: number,
        damage: number,
        attackerUserId: string,
        now: number,
    ): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_world_boss_states
                 SET current_hp = CASE WHEN current_hp - ?3 <= 0 THEN 0 ELSE current_hp - ?3 END,
                     status = CASE WHEN current_hp - ?3 <= 0 THEN 'defeated' ELSE status END,
                     version = version + 1,
                     last_hit_user_id = ?4,
                     updated_at = ?5,
                     defeated_at = CASE WHEN current_hp - ?3 <= 0 THEN ?5 ELSE defeated_at END
                 WHERE scope_key = ?1
                   AND version = ?2
                   AND status = 'alive'`,
            )
            .bind(scopeKey, expectedVersion, damage, attackerUserId, now)
            .run();
        return changedRows(result) > 0;
    }

    async addWorldBossContribution(
        scopeKey: string,
        cycleNo: number,
        playerId: number,
        damage: number,
        killed: boolean,
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_world_boss_contributions (
                    scope_key, cycle_no, player_id, total_damage, attacks, kill_count, updated_at
                ) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)
                ON CONFLICT(scope_key, cycle_no, player_id)
                DO UPDATE SET
                    total_damage = xiuxian_world_boss_contributions.total_damage + excluded.total_damage,
                    attacks = xiuxian_world_boss_contributions.attacks + 1,
                    kill_count = xiuxian_world_boss_contributions.kill_count + excluded.kill_count,
                    updated_at = excluded.updated_at`,
            )
            .bind(scopeKey, cycleNo, playerId, damage, killed ? 1 : 0, now)
            .run();
    }

    async listWorldBossTop(scopeKey: string, cycleNo: number, limit: number): Promise<XiuxianWorldBossContribution[]> {
        const rows = await this.db
            .prepare(
                `SELECT c.player_id, p.user_name, c.total_damage, c.attacks, c.kill_count
                 FROM xiuxian_world_boss_contributions c
                 LEFT JOIN xiuxian_players p ON p.id = c.player_id
                 WHERE c.scope_key = ?1 AND c.cycle_no = ?2
                 ORDER BY c.total_damage DESC, c.kill_count DESC, c.attacks ASC
                 LIMIT ?3`,
            )
            .bind(scopeKey, cycleNo, limit)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toWorldBossContribution);
    }

    async findWorldBossContribution(scopeKey: string, cycleNo: number, playerId: number): Promise<XiuxianWorldBossContribution | null> {
        const row = await this.db
            .prepare(
                `SELECT c.player_id, p.user_name, c.total_damage, c.attacks, c.kill_count
                 FROM xiuxian_world_boss_contributions c
                 LEFT JOIN xiuxian_players p ON p.id = c.player_id
                 WHERE c.scope_key = ?1 AND c.cycle_no = ?2 AND c.player_id = ?3
                 LIMIT 1`,
            )
            .bind(scopeKey, cycleNo, playerId)
            .first<Record<string, unknown>>();
        return row ? toWorldBossContribution(row) : null;
    }

    async findWorldBossRank(scopeKey: string, cycleNo: number, playerId: number): Promise<XiuxianWorldBossContribution | null> {
        const self = await this.findWorldBossContribution(scopeKey, cycleNo, playerId);
        if (!self) return null;
        const row = await this.db
            .prepare(
                `SELECT COUNT(1) AS ahead
                 FROM xiuxian_world_boss_contributions
                 WHERE scope_key = ?1
                   AND cycle_no = ?2
                   AND (
                     total_damage > ?3
                     OR (total_damage = ?3 AND kill_count > ?4)
                     OR (total_damage = ?3 AND kill_count = ?4 AND attacks < ?5)
                   )`,
            )
            .bind(scopeKey, cycleNo, self.totalDamage, self.killCount, self.attacks)
            .first<Record<string, unknown>>();
        return {
            ...self,
            rank: Number(row?.ahead ?? 0) + 1,
        };
    }

    async findTowerProgress(playerId: number): Promise<XiuxianTowerProgress | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_tower_progress
                 WHERE player_id = ?1
                 LIMIT 1`,
            )
            .bind(playerId)
            .first<Record<string, unknown>>();
        return row ? toTowerProgress(row) : null;
    }

    async upsertTowerProgress(
        playerId: number,
        highestFloor: number,
        lastResult: 'win' | 'lose',
        lastRewardJson: string,
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_tower_progress (player_id, highest_floor, last_result, last_reward_json, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(player_id)
                 DO UPDATE SET
                    highest_floor = CASE
                        WHEN excluded.highest_floor > xiuxian_tower_progress.highest_floor THEN excluded.highest_floor
                        ELSE xiuxian_tower_progress.highest_floor
                    END,
                    last_result = excluded.last_result,
                    last_reward_json = excluded.last_reward_json,
                    updated_at = excluded.updated_at`,
            )
            .bind(playerId, highestFloor, lastResult, lastRewardJson, now)
            .run();
    }

    async addTowerLog(
        playerId: number,
        floor: number,
        result: 'win' | 'lose',
        rounds: number,
        rewardJson: string,
        battleLog: string,
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_tower_logs (
                    player_id, floor, result, rounds, reward_json, battle_log, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
            )
            .bind(playerId, floor, result, rounds, rewardJson, battleLog, now)
            .run();
    }

    async listTowerTop(limit: number): Promise<XiuxianTowerRankRow[]> {
        const rows = await this.db
            .prepare(
                `SELECT t.player_id, p.user_name, t.highest_floor, t.updated_at
                 FROM xiuxian_tower_progress t
                 LEFT JOIN xiuxian_players p ON p.id = t.player_id
                 ORDER BY t.highest_floor DESC, t.updated_at ASC
                 LIMIT ?1`,
            )
            .bind(limit)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toTowerRankRow);
    }

    async listTowerWeeklyTop(limit: number, weekStartMs: number): Promise<XiuxianTowerRankRow[]> {
        const rows = await this.db
            .prepare(
                `WITH agg AS (
                    SELECT player_id, MAX(floor) AS highest_floor, MIN(created_at) AS updated_at
                    FROM xiuxian_tower_logs
                    WHERE result = 'win' AND created_at >= ?1
                    GROUP BY player_id
                 )
                 SELECT a.player_id, p.user_name, a.highest_floor, a.updated_at
                 FROM agg a
                 LEFT JOIN xiuxian_players p ON p.id = a.player_id
                 ORDER BY a.highest_floor DESC, a.updated_at ASC
                 LIMIT ?2`,
            )
            .bind(weekStartMs, limit)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toTowerRankRow);
    }

    async findTowerRank(playerId: number): Promise<XiuxianTowerRankRow | null> {
        const self = await this.db
            .prepare('SELECT player_id, highest_floor, updated_at FROM xiuxian_tower_progress WHERE player_id = ?1 LIMIT 1')
            .bind(playerId)
            .first<Record<string, unknown>>();
        if (!self) return null;

        const ahead = await this.db
            .prepare(
                `SELECT COUNT(1) AS ahead
                 FROM xiuxian_tower_progress
                 WHERE highest_floor > ?1
                    OR (highest_floor = ?1 AND updated_at < ?2)`,
            )
            .bind(Number(self.highest_floor), Number(self.updated_at))
            .first<Record<string, unknown>>();

        const name = await this.findPlayerById(playerId);
        return {
            playerId,
            userName: name?.userName,
            highestFloor: Number(self.highest_floor),
            updatedAt: Number(self.updated_at),
            rank: Number(ahead?.ahead ?? 0) + 1,
        };
    }

    async findTowerWeeklyRank(playerId: number, weekStartMs: number): Promise<XiuxianTowerRankRow | null> {
        const self = await this.db
            .prepare(
                `WITH agg AS (
                    SELECT player_id, MAX(floor) AS highest_floor, MIN(created_at) AS updated_at
                    FROM xiuxian_tower_logs
                    WHERE result = 'win' AND created_at >= ?1
                    GROUP BY player_id
                 )
                 SELECT player_id, highest_floor, updated_at
                 FROM agg
                 WHERE player_id = ?2
                 LIMIT 1`,
            )
            .bind(weekStartMs, playerId)
            .first<Record<string, unknown>>();
        if (!self) return null;

        const ahead = await this.db
            .prepare(
                `WITH agg AS (
                    SELECT player_id, MAX(floor) AS highest_floor, MIN(created_at) AS updated_at
                    FROM xiuxian_tower_logs
                    WHERE result = 'win' AND created_at >= ?1
                    GROUP BY player_id
                 )
                 SELECT COUNT(1) AS ahead
                 FROM agg
                 WHERE highest_floor > ?2 OR (highest_floor = ?2 AND updated_at < ?3)`,
            )
            .bind(weekStartMs, Number(self.highest_floor), Number(self.updated_at))
            .first<Record<string, unknown>>();

        const name = await this.findPlayerById(playerId);
        return {
            playerId,
            userName: name?.userName,
            highestFloor: Number(self.highest_floor),
            updatedAt: Number(self.updated_at),
            rank: Number(ahead?.ahead ?? 0) + 1,
        };
    }

    async findTowerWeeklyAheadNeighbor(playerId: number, weekStartMs: number): Promise<XiuxianTowerRankRow | null> {
        const self = await this.findTowerWeeklyRank(playerId, weekStartMs);
        if (!self?.rank || self.rank <= 1) return null;
        const row = await this.db
            .prepare(
                `WITH agg AS (
                    SELECT player_id, MAX(floor) AS highest_floor, MIN(created_at) AS updated_at
                    FROM xiuxian_tower_logs
                    WHERE result = 'win' AND created_at >= ?1
                    GROUP BY player_id
                 )
                 SELECT a.player_id, p.user_name, a.highest_floor, a.updated_at
                 FROM agg a
                 LEFT JOIN xiuxian_players p ON p.id = a.player_id
                 WHERE a.highest_floor > ?2 OR (a.highest_floor = ?2 AND a.updated_at < ?3)
                 ORDER BY a.highest_floor ASC, a.updated_at DESC
                 LIMIT 1`,
            )
            .bind(weekStartMs, self.highestFloor, self.updatedAt)
            .first<Record<string, unknown>>();
        return row ? toTowerRankRow(row) : null;
    }

    async listTowerLogs(playerId: number, page: number, pageSize: number): Promise<XiuxianTowerLog[]> {
        const offset = (page - 1) * pageSize;
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_tower_logs
                 WHERE player_id = ?1
                 ORDER BY id DESC
                 LIMIT ?2 OFFSET ?3`,
            )
            .bind(playerId, pageSize, offset)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toTowerLog);
    }

    async findTowerLog(playerId: number, logId: number): Promise<XiuxianTowerLog | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_tower_logs
                 WHERE player_id = ?1 AND id = ?2
                 LIMIT 1`,
            )
            .bind(playerId, logId)
            .first<Record<string, unknown>>();
        return row ? toTowerLog(row) : null;
    }

    async upsertTowerSeasonProgress(playerId: number, seasonKey: string, highestFloor: number, now: number): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_tower_season_progress (season_key, player_id, highest_floor, updated_at)
                 VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(season_key, player_id)
                 DO UPDATE SET
                    highest_floor = CASE
                        WHEN excluded.highest_floor > xiuxian_tower_season_progress.highest_floor THEN excluded.highest_floor
                        ELSE xiuxian_tower_season_progress.highest_floor
                    END,
                    updated_at = excluded.updated_at`,
            )
            .bind(seasonKey, playerId, highestFloor, now)
            .run();
    }

    async listTowerSeasonTop(seasonKey: string, limit: number): Promise<XiuxianTowerSeasonRankRow[]> {
        const rows = await this.db
            .prepare(
                `SELECT s.season_key, s.player_id, p.user_name, s.highest_floor, s.updated_at
                 FROM xiuxian_tower_season_progress s
                 LEFT JOIN xiuxian_players p ON p.id = s.player_id
                 WHERE s.season_key = ?1
                 ORDER BY s.highest_floor DESC, s.updated_at ASC
                 LIMIT ?2`,
            )
            .bind(seasonKey, limit)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toTowerSeasonRankRow);
    }

    async findTowerSeasonRank(seasonKey: string, playerId: number): Promise<XiuxianTowerSeasonRankRow | null> {
        const self = await this.db
            .prepare(
                `SELECT season_key, player_id, highest_floor, updated_at
                 FROM xiuxian_tower_season_progress
                 WHERE season_key = ?1 AND player_id = ?2
                 LIMIT 1`,
            )
            .bind(seasonKey, playerId)
            .first<Record<string, unknown>>();
        if (!self) return null;

        const ahead = await this.db
            .prepare(
                `SELECT COUNT(1) AS ahead
                 FROM xiuxian_tower_season_progress
                 WHERE season_key = ?1
                   AND (
                     highest_floor > ?2
                     OR (highest_floor = ?2 AND updated_at < ?3)
                   )`,
            )
            .bind(seasonKey, Number(self.highest_floor), Number(self.updated_at))
            .first<Record<string, unknown>>();

        const name = await this.findPlayerById(playerId);
        return {
            seasonKey,
            playerId,
            userName: name?.userName,
            highestFloor: Number(self.highest_floor),
            updatedAt: Number(self.updated_at),
            rank: Number(ahead?.ahead ?? 0) + 1,
        };
    }

    async findTowerSeasonClaim(playerId: number, seasonKey: string): Promise<{claimedAt: number; rewardJson: string} | null> {
        const row = await this.db
            .prepare(
                `SELECT claimed_at, reward_json
                 FROM xiuxian_tower_season_claims
                 WHERE player_id = ?1 AND season_key = ?2
                 LIMIT 1`,
            )
            .bind(playerId, seasonKey)
            .first<Record<string, unknown>>();
        if (!row) return null;
        return {
            claimedAt: Number(row.claimed_at),
            rewardJson: String(row.reward_json ?? '{}'),
        };
    }

    async addTowerSeasonClaim(playerId: number, seasonKey: string, rank: number, rewardJson: string, now: number): Promise<void> {
        await this.db
            .prepare(
                `INSERT OR IGNORE INTO xiuxian_tower_season_claims (
                    season_key, player_id, rank_value, reward_json, claimed_at
                ) VALUES (?1, ?2, ?3, ?4, ?5)`,
            )
            .bind(seasonKey, playerId, rank, rewardJson, now)
            .run();
    }

    async findPet(playerId: number): Promise<XiuxianPet | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pets
                 WHERE player_id = ?1
                 ORDER BY in_battle DESC, updated_at DESC, id DESC
                 LIMIT 1`,
            )
            .bind(playerId)
            .first<Record<string, unknown>>();
        return row ? toPet(row) : null;
    }

    async findPetById(playerId: number, petId: number): Promise<XiuxianPet | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pets
                 WHERE player_id = ?1 AND id = ?2
                 LIMIT 1`,
            )
            .bind(playerId, petId)
            .first<Record<string, unknown>>();
        return row ? toPet(row) : null;
    }

    async listPets(playerId: number): Promise<XiuxianPet[]> {
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pets
                 WHERE player_id = ?1
                 ORDER BY in_battle DESC, updated_at DESC, id DESC`,
            )
            .bind(playerId)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toPet);
    }

    async findPetByName(playerId: number, petName: string): Promise<XiuxianPet | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pets
                 WHERE player_id = ?1 AND pet_name = ?2
                 ORDER BY id DESC
                 LIMIT 1`,
            )
            .bind(playerId, petName)
            .first<Record<string, unknown>>();
        return row ? toPet(row) : null;
    }

    async findPetExclusiveProfileByName(petName: string): Promise<XiuxianPetExclusiveProfile | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pet_exclusive_profiles
                 WHERE pet_name = ?1
                 LIMIT 1`,
            )
            .bind(petName)
            .first<Record<string, unknown>>();
        return row ? toPetExclusiveProfile(row) : null;
    }

    async createPet(playerId: number, petName: string, petType: string, now: number): Promise<XiuxianPet> {
        const active = await this.findPet(playerId);
        const inBattle = active ? 0 : 1;
        await this.db
            .prepare(
                `INSERT INTO xiuxian_pets (
                    player_id, pet_name, pet_type, level, exp, affection, feed_count, last_fed_day, in_battle, created_at, updated_at
                ) VALUES (?1, ?2, ?3, 1, 0, 0, 0, NULL, ?4, ?5, ?5)`,
            )
            .bind(playerId, petName, petType, inBattle, now)
            .run();
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pets
                 WHERE player_id = ?1
                 ORDER BY id DESC
                 LIMIT 1`,
            )
            .bind(playerId)
            .first<Record<string, unknown>>();
        const pet = row ? toPet(row) : null;
        if (!pet) throw new Error('创建宠物后读取失败');
        return pet;
    }

    async upsertPetBanner(
        banner: {
            bannerKey: string;
            title: string;
            status: XiuxianPetBanner['status'];
            startAt: number;
            endAt: number;
            drawCost: number;
            hardPityUr: number;
            hardPityUp: number;
            upPetName?: string | null;
        },
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_pet_banners (
                    banner_key, title, status, start_at, end_at, draw_cost, hard_pity_ur, hard_pity_up, up_pet_name, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
                ON CONFLICT(banner_key)
                DO UPDATE SET
                    title = excluded.title,
                    status = excluded.status,
                    start_at = excluded.start_at,
                    end_at = excluded.end_at,
                    draw_cost = excluded.draw_cost,
                    hard_pity_ur = excluded.hard_pity_ur,
                    hard_pity_up = excluded.hard_pity_up,
                    up_pet_name = excluded.up_pet_name,
                    updated_at = excluded.updated_at`,
            )
            .bind(
                banner.bannerKey,
                banner.title,
                banner.status,
                banner.startAt,
                banner.endAt,
                banner.drawCost,
                banner.hardPityUr,
                banner.hardPityUp,
                banner.upPetName ?? null,
                now,
            )
            .run();
    }

    async findPetBannerByKey(bannerKey: string): Promise<XiuxianPetBanner | null> {
        const row = await this.db
            .prepare('SELECT * FROM xiuxian_pet_banners WHERE banner_key = ?1 LIMIT 1')
            .bind(bannerKey)
            .first<Record<string, unknown>>();
        return row ? toPetBanner(row) : null;
    }

    async findActivePetBanner(now: number): Promise<XiuxianPetBanner | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pet_banners
                 WHERE status = 'active' AND start_at <= ?1 AND end_at > ?1
                 ORDER BY start_at DESC, id DESC
                 LIMIT 1`,
            )
            .bind(now)
            .first<Record<string, unknown>>();
        return row ? toPetBanner(row) : null;
    }

    async replacePetBannerEntries(
        bannerId: number,
        entries: Array<{petName: string; petType: string; rarity: XiuxianPetBannerEntry['rarity']; weight: number; isUp?: number}>,
    ): Promise<void> {
        await this.db
            .prepare('DELETE FROM xiuxian_pet_banner_entries WHERE banner_id = ?1')
            .bind(bannerId)
            .run();
        for (const entry of entries) {
            await this.db
                .prepare(
                    `INSERT INTO xiuxian_pet_banner_entries (
                        banner_id, pet_name, pet_type, rarity, weight, is_up
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
                )
                .bind(bannerId, entry.petName, entry.petType, entry.rarity, Math.max(1, Math.floor(entry.weight)), entry.isUp ?? 0)
                .run();
        }
    }

    async listPetBannerEntries(bannerId: number): Promise<XiuxianPetBannerEntry[]> {
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pet_banner_entries
                 WHERE banner_id = ?1
                 ORDER BY rarity DESC, is_up DESC, weight DESC, id ASC`,
            )
            .bind(bannerId)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toPetBannerEntry);
    }

    async findPetPityState(playerId: number, bannerKey: string): Promise<XiuxianPetPityState | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pet_pity_states
                 WHERE player_id = ?1 AND banner_key = ?2
                 LIMIT 1`,
            )
            .bind(playerId, bannerKey)
            .first<Record<string, unknown>>();
        return row ? toPetPityState(row) : null;
    }

    async upsertPetPityState(
        playerId: number,
        bannerKey: string,
        state: {totalDraws: number; sinceUr: number; sinceUp: number},
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_pet_pity_states (
                    player_id, banner_key, total_draws, since_ur, since_up, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                ON CONFLICT(player_id, banner_key)
                DO UPDATE SET
                    total_draws = excluded.total_draws,
                    since_ur = excluded.since_ur,
                    since_up = excluded.since_up,
                    updated_at = excluded.updated_at`,
            )
            .bind(playerId, bannerKey, state.totalDraws, state.sinceUr, state.sinceUp, now)
            .run();
    }

    async addPetDrawLog(input: {
        playerId: number;
        bannerKey: string;
        drawIndex: number;
        petName: string;
        petType: string;
        rarity: XiuxianPetDrawLog['rarity'];
        isUp: number;
        costSpiritStone: number;
        isDuplicate: number;
        compensationStone: number;
        idempotencyKey?: string | null;
        now: number;
    }): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_pet_draw_logs (
                    player_id, banner_key, draw_index, pet_name, pet_type, rarity, is_up,
                    cost_spirit_stone, is_duplicate, compensation_stone, idempotency_key, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
            )
            .bind(
                input.playerId,
                input.bannerKey,
                input.drawIndex,
                input.petName,
                input.petType,
                input.rarity,
                input.isUp,
                input.costSpiritStone,
                input.isDuplicate,
                input.compensationStone,
                input.idempotencyKey ?? null,
                input.now,
            )
            .run();
    }

    async deployPetById(playerId: number, petId: number, now: number): Promise<boolean> {
        const target = await this.findPetById(playerId, petId);
        if (!target) return false;
        await this.db
            .prepare(
                `UPDATE xiuxian_pets
                 SET in_battle = CASE WHEN id = ?2 THEN 1 ELSE 0 END,
                     updated_at = ?3
                 WHERE player_id = ?1`,
            )
            .bind(playerId, petId, now)
            .run();
        return true;
    }

    async addPetBagItem(
        playerId: number,
        item: {itemKey: string; itemName: string; feedLevel: number; feedAffection: number; quantity: number},
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_pet_bag (
                    player_id, item_key, item_name, feed_level, feed_affection, quantity, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
                ON CONFLICT(player_id, item_key)
                DO UPDATE SET
                    item_name = excluded.item_name,
                    feed_level = excluded.feed_level,
                    feed_affection = excluded.feed_affection,
                    quantity = xiuxian_pet_bag.quantity + excluded.quantity,
                    updated_at = excluded.updated_at`,
            )
            .bind(playerId, item.itemKey, item.itemName, item.feedLevel, item.feedAffection, item.quantity, now)
            .run();
    }

    async listPetBag(playerId: number, page: number, pageSize: number): Promise<XiuxianPetBagItem[]> {
        const offset = (page - 1) * pageSize;
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pet_bag
                 WHERE player_id = ?1
                 ORDER BY id DESC
                 LIMIT ?2 OFFSET ?3`,
            )
            .bind(playerId, pageSize, offset)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toPetBagItem);
    }

    async countPetBag(playerId: number): Promise<number> {
        const row = await this.db
            .prepare('SELECT COUNT(1) AS cnt FROM xiuxian_pet_bag WHERE player_id = ?1 AND quantity > 0')
            .bind(playerId)
            .first<Record<string, unknown>>();
        return Number(row?.cnt ?? 0);
    }

    async findPetBagItem(playerId: number, itemId: number): Promise<XiuxianPetBagItem | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pet_bag
                 WHERE player_id = ?1 AND id = ?2
                 LIMIT 1`,
            )
            .bind(playerId, itemId)
            .first<Record<string, unknown>>();
        return row ? toPetBagItem(row) : null;
    }

    async consumePetBagItem(playerId: number, itemId: number, quantity: number, now: number): Promise<boolean> {
        const consumeQty = Math.max(1, Math.floor(quantity));
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_pet_bag
                 SET quantity = quantity - ?3,
                     updated_at = ?4
                 WHERE player_id = ?1 AND id = ?2 AND quantity >= ?3`,
            )
            .bind(playerId, itemId, consumeQty, now)
            .run();
        await this.db
            .prepare('DELETE FROM xiuxian_pet_bag WHERE player_id = ?1 AND id = ?2 AND quantity <= 0')
            .bind(playerId, itemId)
            .run();
        return changedRows(result) > 0;
    }

    async updatePetFeed(
        petId: number,
        next: {level: number; exp: number; affection: number; feedCountInc: number},
        dayKey: string,
        now: number,
    ): Promise<void> {
        const feedInc = Math.max(1, Math.floor(next.feedCountInc));
        await this.db
            .prepare(
                `UPDATE xiuxian_pets
                 SET level = ?2,
                     exp = ?3,
                     affection = ?4,
                     feed_count = feed_count + ?5,
                     last_fed_day = ?6,
                     updated_at = ?7
                 WHERE id = ?1`,
            )
            .bind(petId, next.level, next.exp, next.affection, feedInc, dayKey, now)
            .run();
    }

    async updatePetBagFeed(
        petId: number,
        next: {level: number; exp: number; affection: number; feedCountInc: number},
        now: number,
    ): Promise<void> {
        const feedInc = Math.max(1, Math.floor(next.feedCountInc));
        await this.db
            .prepare(
                `UPDATE xiuxian_pets
                 SET level = ?2,
                     exp = ?3,
                     affection = ?4,
                     feed_count = feed_count + ?5,
                     updated_at = ?6
                 WHERE id = ?1`,
            )
            .bind(petId, next.level, next.exp, next.affection, feedInc, now)
            .run();
    }

    async updatePetBattleState(petId: number, inBattle: number, now: number): Promise<void> {
        await this.db
            .prepare(
                `UPDATE xiuxian_pets
                 SET in_battle = ?2,
                     updated_at = ?3
                 WHERE id = ?1`,
            )
            .bind(petId, inBattle, now)
            .run();
    }

    async findPetMilestoneClaim(playerId: number, milestoneLevel: number): Promise<boolean> {
        const row = await this.db
            .prepare(
                `SELECT 1 AS ok
                 FROM xiuxian_pet_milestone_claims
                 WHERE player_id = ?1 AND milestone_level = ?2
                 LIMIT 1`,
            )
            .bind(playerId, milestoneLevel)
            .first<Record<string, unknown>>();
        return Boolean(row?.ok);
    }

    async addPetMilestoneClaim(
        playerId: number,
        petId: number,
        milestoneLevel: number,
        rewardJson: string,
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT OR IGNORE INTO xiuxian_pet_milestone_claims (
                    player_id, pet_id, milestone_level, reward_json, claimed_at
                ) VALUES (?1, ?2, ?3, ?4, ?5)`,
            )
            .bind(playerId, petId, milestoneLevel, rewardJson, now)
            .run();
    }

    async findNpcEncounterByDay(playerId: number, dayKey: string): Promise<XiuxianNpcEncounterRecord | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_npc_encounters
                 WHERE player_id = ?1 AND day_key = ?2
                 LIMIT 1`,
            )
            .bind(playerId, dayKey)
            .first<Record<string, unknown>>();
        return row ? toNpcEncounter(row) : null;
    }

    async addNpcEncounter(
        playerId: number,
        dayKey: string,
        eventCode: string,
        eventTitle: string,
        eventTier: string,
        rewardJson: string,
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT OR IGNORE INTO xiuxian_npc_encounters (
                    player_id, day_key, event_code, event_title, event_tier, reward_json, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
            )
            .bind(playerId, dayKey, eventCode, eventTitle, eventTier, rewardJson, now)
            .run();
    }

    async listNpcEncounters(playerId: number, page: number, pageSize: number): Promise<XiuxianNpcEncounterRecord[]> {
        const offset = (page - 1) * pageSize;
        const rows = await this.db
            .prepare(
                `SELECT * FROM xiuxian_npc_encounters
                 WHERE player_id = ?1
                 ORDER BY id DESC
                 LIMIT ?2 OFFSET ?3`,
            )
            .bind(playerId, pageSize, offset)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toNpcEncounter);
    }

    async findPlayerByPlatformUserId(platform: string, userId: string): Promise<XiuxianPlayer | null> {
        const row = await this.db
            .prepare('SELECT * FROM xiuxian_players WHERE platform = ?1 AND user_id = ?2 LIMIT 1')
            .bind(platform, userId)
            .first<Record<string, unknown>>();
        return row ? toPlayer(row) : null;
    }

    async findPendingPvpRequestBetween(requesterId: number, targetId: number, mode: XiuxianPvpMode, now: number): Promise<XiuxianPvpRequest | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pvp_requests
                 WHERE requester_id = ?1
                   AND target_id = ?2
                   AND mode = ?3
                   AND status = 'pending'
                   AND expires_at > ?4
                 ORDER BY id DESC
                 LIMIT 1`,
            )
            .bind(requesterId, targetId, mode, now)
            .first<Record<string, unknown>>();
        return row ? toPvpRequest(row) : null;
    }

    async findLatestIncomingPvpRequest(targetId: number, mode: XiuxianPvpMode, now: number): Promise<XiuxianPvpRequest | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_pvp_requests
                 WHERE target_id = ?1
                   AND mode = ?2
                   AND status = 'pending'
                   AND expires_at > ?3
                 ORDER BY created_at DESC, id DESC
                 LIMIT 1`,
            )
            .bind(targetId, mode, now)
            .first<Record<string, unknown>>();
        return row ? toPvpRequest(row) : null;
    }

    async createPvpRequest(requesterId: number, targetId: number, mode: XiuxianPvpMode, expiresAt: number, now: number): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_pvp_requests (
                    requester_id, target_id, mode, status, expires_at, created_at, updated_at
                ) VALUES (?1, ?2, ?3, 'pending', ?4, ?5, ?5)`,
            )
            .bind(requesterId, targetId, mode, expiresAt, now)
            .run();
    }

    async updatePvpRequestStatus(
        requestId: number,
        fromStatus: XiuxianPvpRequest['status'],
        toStatus: XiuxianPvpRequest['status'],
        now: number,
    ): Promise<boolean> {
        const result = await this.db
            .prepare(
                `UPDATE xiuxian_pvp_requests
                 SET status = ?3,
                     updated_at = ?4
                 WHERE id = ?1 AND status = ?2`,
            )
            .bind(requestId, fromStatus, toStatus, now)
            .run();
        return changedRows(result) > 0;
    }

    async findBondBetween(a: number, b: number): Promise<XiuxianBond | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_bonds
                 WHERE (requester_id = ?1 AND target_id = ?2)
                    OR (requester_id = ?2 AND target_id = ?1)
                 LIMIT 1`,
            )
            .bind(a, b)
            .first<Record<string, unknown>>();
        return row ? toBond(row) : null;
    }

    async findLatestBondByPlayer(playerId: number): Promise<XiuxianBond | null> {
        const row = await this.db
            .prepare(
                `SELECT * FROM xiuxian_bonds
                 WHERE (requester_id = ?1 OR target_id = ?1)
                   AND status IN ('pending', 'active')
                 ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, updated_at DESC, id DESC
                 LIMIT 1`,
            )
            .bind(playerId)
            .first<Record<string, unknown>>();
        return row ? toBond(row) : null;
    }

    async findBondById(bondId: number): Promise<XiuxianBond | null> {
        const row = await this.db
            .prepare('SELECT * FROM xiuxian_bonds WHERE id = ?1 LIMIT 1')
            .bind(bondId)
            .first<Record<string, unknown>>();
        return row ? toBond(row) : null;
    }

    async findTowerAheadNeighbor(playerId: number): Promise<XiuxianTowerRankRow | null> {
        const self = await this.findTowerRank(playerId);
        if (!self?.rank || self.rank <= 1) return null;
        const row = await this.db
            .prepare(
                `SELECT t.player_id, p.user_name, t.highest_floor, t.updated_at
                 FROM xiuxian_tower_progress t
                 LEFT JOIN xiuxian_players p ON p.id = t.player_id
                 WHERE (
                     t.highest_floor > ?1
                     OR (t.highest_floor = ?1 AND t.updated_at < ?2)
                 )
                 ORDER BY t.highest_floor ASC, t.updated_at DESC
                 LIMIT 1`,
            )
            .bind(self.highestFloor, self.updatedAt)
            .first<Record<string, unknown>>();
        return row ? toTowerRankRow(row) : null;
    }

    async findTowerSeasonAheadNeighbor(seasonKey: string, playerId: number): Promise<XiuxianTowerSeasonRankRow | null> {
        const self = await this.findTowerSeasonRank(seasonKey, playerId);
        if (!self?.rank || self.rank <= 1) return null;
        const row = await this.db
            .prepare(
                `SELECT s.season_key, s.player_id, p.user_name, s.highest_floor, s.updated_at
                 FROM xiuxian_tower_season_progress s
                 LEFT JOIN xiuxian_players p ON p.id = s.player_id
                 WHERE s.season_key = ?1
                   AND (
                     s.highest_floor > ?2
                     OR (s.highest_floor = ?2 AND s.updated_at < ?3)
                   )
                 ORDER BY s.highest_floor ASC, s.updated_at DESC
                 LIMIT 1`,
            )
            .bind(seasonKey, self.highestFloor, self.updatedAt)
            .first<Record<string, unknown>>();
        return row ? toTowerSeasonRankRow(row) : null;
    }

    async createBondRequest(requesterId: number, targetId: number, now: number): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_bonds (
                    requester_id, target_id, status, intimacy, level, last_travel_day, created_at, updated_at
                ) VALUES (?1, ?2, 'pending', 0, 1, NULL, ?3, ?3)`,
            )
            .bind(requesterId, targetId, now)
            .run();
    }

    async reopenBondRequest(bondId: number, requesterId: number, targetId: number, now: number): Promise<void> {
        await this.db
            .prepare(
                `UPDATE xiuxian_bonds
                 SET requester_id = ?2,
                     target_id = ?3,
                     status = 'pending',
                     intimacy = 0,
                     level = 1,
                     last_travel_day = NULL,
                     updated_at = ?4
                 WHERE id = ?1`,
            )
            .bind(bondId, requesterId, targetId, now)
            .run();
    }

    async activateBond(bondId: number, now: number): Promise<void> {
        await this.db
            .prepare(
                `UPDATE xiuxian_bonds
                 SET status = 'active', updated_at = ?2
                 WHERE id = ?1`,
            )
            .bind(bondId, now)
            .run();
    }

    async endBond(bondId: number, now: number): Promise<void> {
        await this.db
            .prepare(
                `UPDATE xiuxian_bonds
                 SET status = 'ended',
                     updated_at = ?2
                 WHERE id = ?1`,
            )
            .bind(bondId, now)
            .run();
    }

    async updateBondTravel(bondId: number, intimacy: number, level: number, dayKey: string, now: number): Promise<void> {
        await this.db
            .prepare(
                `UPDATE xiuxian_bonds
                 SET intimacy = ?2,
                     level = ?3,
                     last_travel_day = ?4,
                     updated_at = ?5
                 WHERE id = ?1`,
            )
            .bind(bondId, intimacy, level, dayKey, now)
            .run();
    }

    async addBondLog(bondId: number, playerId: number, action: string, deltaIntimacy: number, rewardJson: string, now: number): Promise<void> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_bond_logs (
                    bond_id, player_id, action, delta_intimacy, reward_json, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
            )
            .bind(bondId, playerId, action, deltaIntimacy, rewardJson, now)
            .run();
    }

    async listBondLogs(playerId: number, page: number, pageSize: number): Promise<XiuxianBondLog[]> {
        const offset = (page - 1) * pageSize;
        const rows = await this.db
            .prepare(
                `SELECT l.*
                 FROM xiuxian_bond_logs l
                 JOIN xiuxian_bonds b ON b.id = l.bond_id
                 WHERE b.requester_id = ?1 OR b.target_id = ?1
                 ORDER BY l.id DESC
                 LIMIT ?2 OFFSET ?3`,
            )
            .bind(playerId, pageSize, offset)
            .all<Record<string, unknown>>();
        return (rows.results ?? []).map(toBondLog);
    }

    async findBondMilestoneClaim(bondId: number, intimacyMilestone: number): Promise<boolean> {
        const row = await this.db
            .prepare(
                `SELECT 1 AS ok
                 FROM xiuxian_bond_milestone_claims
                 WHERE bond_id = ?1 AND intimacy_milestone = ?2
                 LIMIT 1`,
            )
            .bind(bondId, intimacyMilestone)
            .first<Record<string, unknown>>();
        return Boolean(row?.ok);
    }

    async addBondMilestoneClaim(
        bondId: number,
        playerId: number,
        intimacyMilestone: number,
        rewardJson: string,
        now: number,
    ): Promise<void> {
        await this.db
            .prepare(
                `INSERT OR IGNORE INTO xiuxian_bond_milestone_claims (
                    bond_id, player_id, intimacy_milestone, reward_json, claimed_at
                ) VALUES (?1, ?2, ?3, ?4, ?5)`,
            )
            .bind(bondId, playerId, intimacyMilestone, rewardJson, now)
            .run();
    }
}

