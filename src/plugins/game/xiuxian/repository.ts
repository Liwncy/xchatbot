import type {
    CooldownState,
    EquipmentSlot,
    XiuxianBagQuery,
    XiuxianBagSort,
    XiuxianBattle,
    XiuxianIdentity,
    XiuxianItem,
    XiuxianPlayer,
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
        const dayKey = new Date(now).toISOString().slice(0, 10);
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
}

