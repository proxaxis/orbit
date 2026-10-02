<script setup>
import { useId } from 'vue';

const boxId = useId();

const props = defineProps({
	modelValue: {
		type: Boolean,
		required: true
	}
});

const emit = defineEmits(['update:modelValue']);

const handleToggle = () => {
	emit('update:modelValue', !props.modelValue);
};
</script>

<template>
	<label class="toggle-button">
		<button type="button" :class="['toggle-switch', { active: modelValue }]" @click="handleToggle">
			<span class="toggle-slider"></span>
		</button>
		<span class="toggle-label">
			<slot></slot>
		</span>
	</label>
</template>

<style lang="scss" scoped>
.toggle-button {
	display: inline-flex;
	align-items: center;
	gap: 0.9rem;
	cursor: pointer;
	user-select: none;
}

.toggle-switch {
	position: relative;
	width: 60px;
	height: 34px;
	background-color: var(--text-light);
	border: none;
	border-radius: 34px;
	cursor: pointer;
	padding: 0;
	transition: background-color 0.3s ease;
	outline: none;
	flex-shrink: 0;

	&.active {
		background-color: var(--accent);

		.toggle-slider {
			left: 29px;
		}
	}

	&:hover {
		opacity: 0.8;
	}
}

.toggle-slider {
	position: absolute;
	top: 3px;
	left: 3px;
	width: 28px;
	height: 28px;
	background-color: var(--text);
	border-radius: 50%;
	transition: left 0.3s ease;
}

.toggle-label {
	display: inline;
	color: inherit;
}
</style>
