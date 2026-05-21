import type { App } from "obsidian";
import { logger } from "../../utils/logger";
import { getSharedIRWorkspaceSnapshotService } from "./IRWorkspaceSnapshotService";
import { getSharedIRCalendarQueryService } from "./IRCalendarQueryService";
import {
	getSharedIRScheduleKernel,
	IRScheduleKernel,
	type RecomputeOptions,
	type ScheduleRecomputeReason,
} from "./IRScheduleKernel";

export const IR_DATA_UPDATED_EVENT = "Weave:ir-data-updated";

export type UpdatedEventDetail = {
	reason: ScheduleRecomputeReason;
	generatedAt: number;
	deckIds?: string[];
};

const kernelByApp = new WeakMap<App, IRScheduleKernel>();
let irDataMutationGeneration = 0;

/** 当前 IR 数据变更世代；磁盘日历/排程缓存写入时会记录，失效后递增。 */
export function getIRDataMutationGeneration(): number {
	return irDataMutationGeneration;
}

function bumpIRDataMutationGeneration(): number {
	irDataMutationGeneration += 1;
	return irDataMutationGeneration;
}

function getKernel(app: App): IRScheduleKernel {
	let kernel = kernelByApp.get(app);
	if (!kernel) {
		kernel = getSharedIRScheduleKernel(app);
		kernelByApp.set(app, kernel);
	}
	return kernel;
}

/** 阅读点 / 牌组 / 调度数据变更后统一失效各层缓存（workspace、日历、排程内核）。 */
export function invalidateIRDataCaches(
	app: App,
	options?: {
		invalidateScheduleCache?: boolean;
		notifyUi?: boolean;
		reason?: ScheduleRecomputeReason;
		deckIds?: string[];
	}
): void {
	bumpIRDataMutationGeneration();
	getSharedIRWorkspaceSnapshotService(app).invalidate();
	getSharedIRCalendarQueryService(app).invalidate();
	if (options?.invalidateScheduleCache !== false) {
		getKernel(app).invalidateScheduleCache();
	}
	if (options?.notifyUi !== false) {
		dispatchIRDataUpdatedEvent({
			reason: options?.reason ?? "metadata_changed",
			generatedAt: Date.now(),
			deckIds: options?.deckIds,
		});
	}
}

function dispatchIRDataUpdatedEvent(detail: UpdatedEventDetail): UpdatedEventDetail {
	window.dispatchEvent(
		new CustomEvent<UpdatedEventDetail>(IR_DATA_UPDATED_EVENT, {
			detail,
		})
	);
	return detail;
}

export function broadcastIRDataUpdated(
	app: App,
	options?: {
		reason?: ScheduleRecomputeReason;
		generatedAt?: number;
		deckIds?: string[];
		invalidateScheduleCache?: boolean;
	}
): UpdatedEventDetail {
	invalidateIRDataCaches(app, {
		invalidateScheduleCache: options?.invalidateScheduleCache,
		notifyUi: false,
	});

	return dispatchIRDataUpdatedEvent({
		reason: options?.reason ?? "ui_refresh",
		generatedAt: options?.generatedAt ?? Date.now(),
		deckIds: options?.deckIds,
	});
}

export async function recomputeAndBroadcastIRData(
	app: App,
	reason: ScheduleRecomputeReason,
	options?: RecomputeOptions
): Promise<UpdatedEventDetail> {
	try {
		invalidateIRDataCaches(app);
		const kernel = getKernel(app);
		const schedule = await kernel.recomputeScheduleForDeck(reason, options);
		const detail: UpdatedEventDetail = {
			reason,
			generatedAt: schedule.generatedAt,
			deckIds: schedule.deckIds,
		};
		return dispatchIRDataUpdatedEvent(detail);
	} catch (error) {
		invalidateIRDataCaches(app);
		logger.error("[IRScheduleRefreshService] 重排并广播失败:", { reason, options, error });
		const detail: UpdatedEventDetail = {
			reason,
			generatedAt: Date.now(),
			deckIds: options?.deckIds,
		};
		return dispatchIRDataUpdatedEvent(detail);
	}
}
