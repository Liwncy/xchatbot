import type {
    XiuxianAchievementDef,
    CooldownState,
    XiuxianBossLog,
    XiuxianBossState,
    XiuxianWorldBossContribution,
    XiuxianWorldBossState,
    XiuxianCheckin,
    EquipmentSlot,
    XiuxianBagQuery,
    XiuxianBagSort,
    XiuxianBattle,
    XiuxianEconomyLog,
    XiuxianIdentity,
    XiuxianItem,
    XiuxianNpcEncounterRecord,
    XiuxianPlayerAchievement,
    XiuxianPlayer,
    XiuxianPlayerTask,
    XiuxianPet,
    XiuxianShopOffer,
    XiuxianTaskDef,
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
        quality: String(row.quality),
        attack: Number(row.attack),
        defense: Number(row.defense),
        hp: Number(row.hp),
        dodge: Number(row.dodge),
        crit: Number(row.crit),
        score: Number(row.score),
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
        affection: Number(row.affection),
        feedCount: Number(row.feed_count),
        lastFedDay: row.last_fed_day == null ? null : String(row.last_fed_day),
        inBattle: Number(row.in_battle ?? 1),
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
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
                    attack, defense, hp, dodge, crit, score, is_locked, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
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
                 LIMIT 1`,
            )
            .bind(playerId)
            .first<Record<string, unknown>>();
        return row ? toPet(row) : null;
    }

    async createPet(playerId: number, petName: string, petType: string, now: number): Promise<XiuxianPet> {
        await this.db
            .prepare(
                `INSERT INTO xiuxian_pets (
                    player_id, pet_name, pet_type, level, affection, feed_count, last_fed_day, in_battle, created_at, updated_at
                ) VALUES (?1, ?2, ?3, 1, 0, 0, NULL, 1, ?4, ?4)`,
            )
            .bind(playerId, petName, petType, now)
            .run();
        const pet = await this.findPet(playerId);
        if (!pet) throw new Error('创建宠物后读取失败');
        return pet;
    }

    async updatePetFeed(petId: number, dayKey: string, now: number): Promise<void> {
        await this.db
            .prepare(
                `UPDATE xiuxian_pets
                 SET level = level + 1,
                     affection = CASE WHEN affection + 6 > 100 THEN 100 ELSE affection + 6 END,
                     feed_count = feed_count + 1,
                     last_fed_day = ?2,
                     updated_at = ?3
                 WHERE id = ?1`,
            )
            .bind(petId, dayKey, now)
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
}

