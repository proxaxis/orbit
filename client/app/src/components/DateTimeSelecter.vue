<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import IconCaretLeft from '@/components/icons/IconCaretLeft.vue';
import IconCaretRight from '@/components/icons/IconCaretRight.vue';
import IconXMark from './icons/IconXMark.vue';
import { useCalendarStore } from '@/stores/calendar';
import { useConfigStore } from '@/stores/config';
const calendarStore = useCalendarStore();
const configStore = useConfigStore();
const cnf = computed(() => configStore.config);

const props = defineProps({
	modelValue: { type: Date, default: () => new Date() },
	isOpen: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'close']);

const modes = [
	{ value: 'scroll', label: 'Scroll' },
	{ value: 'pad', label: 'Pad' },
	{ value: 'keyboard', label: 'Key' },
	{ value: 'advanced', label: 'Adv' },
];
const currentMode = ref(cnf.value.tool.lastDateTimeSelecterMode);
const localDate = ref(new Date(props.modelValue));
const localViewingDate = ref(new Date(props.modelValue));
const padBuffer = ref('');
const advInput = ref('');
const advancedPreview = ref('');
const rfAdvInput = ref(null);

watch(() => props.isOpen, (to) => {
	if (to) {
		localDate.value = new Date(props.modelValue);
		localViewingDate.value = new Date(props.modelValue);
		padBuffer.value = '';
		advInput.value = '';
		advancedPreview.value = '';
		if (localDate.value.getMinutes() % 5 !== 0) {
			localDate.value.setMinutes(Math.floor(localDate.value.getMinutes() / 5) * 5);
		}
	}
});

watch(currentMode, (to) => {
	if (to === 'advanced') nextTick(() => rfAdvInput.value?.focus());
	cnf.value.tool.lastDateTimeSelecterMode = to;
});

const calendarMatrix = computed(() => calendarStore.generateCalendarMatrix(localViewingDate.value));

const formattedTime = computed(() => {
	const h = localDate.value.getHours().toString().padStart(2, '0');
	const m = localDate.value.getMinutes().toString().padStart(2, '0');
	return `${h}:${m}`;
});

const formattedFullDate = computed(() => {
	return localDate.value.toLocaleString('ja-JP', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
});

const addMonth = (n) => {
	localViewingDate.value = new Date(localViewingDate.value.setMonth(localViewingDate.value.getMonth() + n));
};

const selectDate = (date) => {
	const newDate = new Date(localDate.value);
	newDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
	localDate.value = newDate;
	if (date.getMonth() !== localViewingDate.value.getMonth()) {
		localViewingDate.value = new Date(date);
	}
};

const isSameDate = (d1, d2) => {
	return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
};

const setTime = (h, m) => {
	const d = new Date(localDate.value);
	d.setHours(h);
	d.setMinutes(m);
	localDate.value = d;
};

const inputPad = (val) => {
	padBuffer.value += String(val);

	if (padBuffer.value.length >= 4) {
		const raw = padBuffer.value.slice(0, 4);
		const h = parseInt(raw.slice(0, 2), 10);
		const m = parseInt(raw.slice(2, 4), 10);

		// バリデーション: 24時間以内、60分以内か
		if (!isNaN(h) && !isNaN(m) && h < 24 && m < 60) {
			setTime(h, m);
		}

		// 4桁入力後はバッファをクリアして、確定した時刻（formattedTime）を表示に戻す
		padBuffer.value = '';
	}
};

// 入力中のバッファを見やすく表示する（例: "123" -> "12:3"）
const formatBuffer = (val) => {
	if (!val) return '';
	if (val.length <= 2) return val;
	return val.slice(0, 2) + ':' + val.slice(2);
};

// Methods: Keyboard Mode
const onTimeInput = (e) => {
	const [h, m] = e.target.value.split(':').map(Number);
	if (!isNaN(h) && !isNaN(m)) setTime(h, m);
};

// Methods: Advanced Mode
const parseAdvanced = () => {
	const raw = advInput.value.replace(/\s+/g, '');
	if (raw.length < 6) {
		advancedPreview.value = '';
		return;
	}

	const now = new Date();
	let y = now.getFullYear();
	let mo = now.getMonth();
	let d, h, m;

	// Pattern Match
	// ① YYYYMMDDHHMM (12 digits)
	// ② MMDDHHMM (8 digits)
	// ③ DDHHMM (6 digits)

	try {
		if (raw.length === 12) {
			y = parseInt(raw.slice(0, 4));
			mo = parseInt(raw.slice(4, 6)) - 1;
			d = parseInt(raw.slice(6, 8));
			h = parseInt(raw.slice(8, 10));
			m = parseInt(raw.slice(10, 12));
		} else if (raw.length === 8) {
			mo = parseInt(raw.slice(0, 2)) - 1;
			d = parseInt(raw.slice(2, 4));
			h = parseInt(raw.slice(4, 6));
			m = parseInt(raw.slice(6, 8));
			const temp = new Date(y, mo, d, h, m);
			if (temp < now) y++;
		} else if (raw.length === 6) {
			d = parseInt(raw.slice(0, 2));
			h = parseInt(raw.slice(2, 4));
			m = parseInt(raw.slice(4, 6));
			const temp = new Date(y, mo, d, h, m);
			if (temp < now) {
				if (mo === 11) {
					y++;
					mo = 0;
				} else {
					mo++;
				}
			}
		} else {
			return;
		}

		const result = new Date(y, mo, d, h, m);
		if (!isNaN(result.getTime())) {
			advancedPreview.value = result.toLocaleString('ja-JP');
			localDate.value = result;
		}
	} catch (e) {
		advancedPreview.value = '無効な形式';
	}
};

// Final Actions
const close = () => emit('close');
const confirm = () => {
	emit('update:modelValue', localDate.value.toISOString());
	close();
};
</script>

<template>
	<teleport to="body">
		<div v-if="isOpen" class="date-time-selecter" @click.self="close">
			<div class="wrapper">
				<header>
					<IconXMark @click="close" />
					<nav>
						<button v-for="m in modes" :key="m.value" :class="{ active: currentMode === m.value }"
							@click="currentMode = m.value">
							{{ m.label }}
						</button>
					</nav>
				</header>

				<main>
					<div v-if="currentMode !== 'advanced'" class="calendar">
						<div class="calendar-header">
							<IconCaretLeft @click="addMonth(-1)" />
							<span>{{ calendarStore.getHeaderTitle(localDate) }}</span>
							<IconCaretRight @click="addMonth(1)" />
						</div>
						<div class="calendar-grid">
							<span v-for="d in calendarMatrix" :key="d.date.toISOString()" :class="{
								'is-selected': isSameDate(d.date, localDate),
								'is-other-month': !d.isCurrentMonth,
							}" @click="selectDate(d.date)">
								{{ d.date.getDate() }}
							</span>
						</div>
					</div>

					<div class="time">
						<div v-if="currentMode === 'scroll'" class="scroll-picker">
							<div class="scroll-col">
								<div v-for="h in 24" :key="h - 1" :class="{ active: localDate.getHours() === h - 1 }"
									@click="setTime(h - 1, localDate.getMinutes())">
									{{ (h - 1).toString().padStart(2, '0') }}
								</div>
							</div>
							<div class="scroll-col">
								<div v-for="m in 59" :key="m" :class="{ active: localDate.getMinutes() === m }"
									@click="setTime(localDate.getHours(), m)">
									{{ m.toString().padStart(2, '0') }}
								</div>
							</div>
						</div>

						<div v-if="currentMode === 'pad'" class="pad-picker">
							<div class="time-display">
								{{ padBuffer ? formatBuffer(padBuffer) : formattedTime }}
							</div>
							<div class="pad-grid">
								<button v-for="n in [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]" :key="n" @click="inputPad(n)">{{ n }}</button>
								<button @click="inputPad('00')">00</button>
								<button @click="inputPad('30')">30</button>
								<button class="clear-btn" @click="padBuffer = ''">C</button>
							</div>
						</div>

						<div v-if="currentMode === 'keyboard'" class="keyboard-picker">
							<label>時間入力 (HH:MM)</label>
							<input type="time" :value="formattedTime" @input="onTimeInput" />
						</div>

						<div v-if="currentMode === 'advanced'" class="advanced-picker">
							<p class="hint">YYYYMMDD HHMM / MMDD HHMM / DD HHMM</p>
							<input v-model="advInput" type="text" placeholder="例: 1231 1800" @input="parseAdvanced"
								ref="rfAdvInput" />
							<div class="preview">予定: {{ advancedPreview || '---' }}</div>
						</div>
					</div>
				</main>

				<div class="result">{{ formattedFullDate }}</div>

				<footer>
					<div class="actions">
						<button @click="close">キャンセル</button>
						<button class="primary" @click="confirm">決定</button>
					</div>
				</footer>
			</div>
		</div>
	</teleport>
</template>

<style lang="scss" scoped>
.date-time-selecter {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	justify-content: center;
	align-items: center;
	z-index: 1000;
}

.wrapper {
	display: flex;
	flex-direction: column;
	background: var(--bg-0);
	border-radius: var(--border-radius);
	display: flex;
	flex-direction: column;
	overflow: hidden;
	box-shadow: 0 4px 20px var(--shadow);
	min-width: 500px;
	min-height: 800px;
}

header {
	background: var(--bg-0);
	display: flex;
	flex-direction: column;

	nav {
		display: flex;

		button {
			flex: 1;
			padding: 1rem 0;
			border: none;
			cursor: pointer;
			text-align: center;
			justify-content: center;
			border-bottom: 2px solid var(--border);

			&.active {
				border-bottom: 2px solid var(--primary);
			}
		}
	}

	.icon-x-mark {
		align-self: flex-end;
		padding: 1rem;
	}
}

main {
	flex: 1;
	padding: 1rem 6rem;
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.calendar {
	flex: 1;

	.calendar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 10px;
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 4px;
		text-align: center;

		span {
			padding: 6px;
			border-radius: 50%;
			cursor: pointer;
			font-size: 0.9rem;

			&:hover {
				background: var(--bg-2);
			}

			&.is-other-month {
				color: var(--text-light);
			}

			&.is-selected {
				background: var(--accent);
				color: white;
				font-weight: bold;
			}
		}
	}
}

/* Time Sections */
.time {
	flex: 1;
	display: flex;
	flex-direction: column;
	justify-content: center;
}

/* Scroll Mode */
.scroll-picker {
	display: flex;
	height: 150px;
	gap: 10px;

	.scroll-col {
		flex: 1;
		overflow-y: auto;
		text-align: center;
		border: 1px solid #eee;
		border-radius: 8px;
		scrollbar-width: none;

		/* Firefox */
		&::-webkit-scrollbar {
			display: none;
		}

		/* Chrome */
		div {
			padding: 10px;
			cursor: pointer;

			&.active {
				background: var(--text);
				color: var(--accent);
				font-weight: bold;
			}
		}
	}
}

/* Pad Mode */
.pad-picker {
	.time-display {
		font-size: 2rem;
		text-align: center;
		margin-bottom: 10px;
		font-family: monospace;
	}

	.pad-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;

		button {
			padding: 12px;
			border: 1px solid #eee;
			background: white;
			border-radius: 8px;
			font-size: 1.1rem;

			&:active {
				background: #f9f9f9;
			}

			&.clear-btn {
				background: #ffebee;
				color: #c62828;
			}
		}
	}
}

/* Keyboard Mode */
.keyboard-picker {
	text-align: center;

	input {
		font-size: 2rem;
		padding: 10px;
		width: 100%;
		text-align: center;
		border: 1px solid #ddd;
		border-radius: 8px;
		margin-top: 10px;
	}
}

/* Advanced Mode */
.advanced-picker {
	input {
		width: 100%;
		padding: 12px;
		font-size: 1.2rem;
		border: 2px solid #ddd;
		border-radius: 8px;

		&:focus {
			border-color: #42b883;
			outline: none;
		}
	}

	.hint {
		font-size: 0.8rem;
		color: #888;
		margin-bottom: 8px;
	}

	.preview {
		margin-top: 10px;
		font-weight: bold;
		color: #42b883;
		text-align: right;
	}
}

footer {
	padding: 1rem;
	border-top: 1px solid var(--border);
	display: flex;
	align-items: center;

	.actions {
		width: 100%;
		display: flex;
		gap: 0.5rem;
		justify-content: end;

		button {
			padding: 0.6rem 1.3rem;
			border: 1px solid var(--border);
			border-radius: var(--border-radius);
			cursor: pointer;

			&.primary {
				background: var(--primary);
				color: white;
				border-color: var(--primary);
			}
		}
	}
}
</style>
