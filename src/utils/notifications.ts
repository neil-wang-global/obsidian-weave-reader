export function showNotification(
	message: string,
	type: "success" | "error" | "info" | "warning" = "info"
) {
	const n = activeDocument.createElement("div");
	n.className = `weave-notification notification-${type}`;

	const icon = activeDocument.createElement("span");
	icon.className = "weave-notification-icon";

	const iconMap = {
		success: "\u2713",
		error: "\u2715",
		warning: "\u26A0",
		info: "\u2139",
	};

	icon.textContent = iconMap[type] || iconMap.info;
	n.appendChild(icon);

	const textSpan = activeDocument.createElement("span");
	textSpan.textContent = message;
	textSpan.className = "weave-flex-1";
	n.appendChild(textSpan);

	activeDocument.body.appendChild(n);

	window.setTimeout(() => {
		n.classList.add("is-visible");
	}, 10);

	window.setTimeout(() => {
		n.classList.remove("is-visible");
		window.setTimeout(() => {
			if (n.parentNode) {
				n.remove();
			}
		}, 300);
	}, 3000);
}
