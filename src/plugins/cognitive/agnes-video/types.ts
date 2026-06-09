export type AgnesVideoTaskMode = 'text' | 'quote';

export interface AgnesVideoTicketRecord {
    ticket: string;
    videoId: string;
    taskId?: string;
    prompt: string;
    from: string;
    roomId?: string;
    createdAt: number;
    mode: AgnesVideoTaskMode;
    /** 视频封面图 URL，文绘影为百度绘图，图绘影为引用图 CDN 地址。 */
    thumbUrl?: string;
}

export interface AgnesVideoCreateRequest {
    model: string;
    prompt: string;
    height: number;
    width: number;
    num_frames: number;
    frame_rate: number;
    image?: string;
}

export interface AgnesVideoCreateResponse {
    id?: string;
    task_id?: string;
    video_id?: string;
    status?: string;
    progress?: number;
    seconds?: string;
    size?: string;
    error?: string | null;
}

export interface AgnesVideoQueryResponse {
    id?: string;
    video_id?: string;
    status?: string;
    progress?: number;
    seconds?: string;
    size?: string;
    remixed_from_video_id?: string | null;
    error?: string | null;
}
