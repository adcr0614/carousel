class Carousel {
	constructor(elementId, options = {}) {
		// 要素の取得
		this.carousel = document.getElementById(elementId);
		this.items = this.carousel.querySelectorAll(".carousel-item");
		this.container = this.carousel.parentElement;

		// イベントシステム
		this.events = {};

		// オプション設定
		this.options = {
			// 基本設定
			direction: options.direction || "horizontal", // horizontal または vertical
			duration: options.duration || 0.5, // トランジション時間（秒）
			easing: options.easing || "ease", // イージング関数
			gap: options.gap || 0, // アイテム間のギャップ（px）

			// ナビゲーション設定
			navigation: {
				enabled: options.navigation?.enabled !== undefined ? options.navigation.enabled : true,
				prevEl: options.navigation?.prevEl || "#prevBtn",
				nextEl: options.navigation?.nextEl || "#nextBtn",
			},

			// ページネーション設定
			pagination: {
				enabled: options.pagination?.enabled !== undefined ? options.pagination.enabled : true,
				el: options.pagination?.el || "#indicators",
				clickable: options.pagination?.clickable !== undefined ? options.pagination.clickable : true,
			},

			// 自動再生設定
			autoplay: options.autoplay || false,
			pauseOnHover: options.pauseOnHover !== undefined ? options.pauseOnHover : false, // マウスオーバー時の停止を無効化

			// ループ設定
			loop: {
				enabled: options.loop?.enabled !== undefined ? options.loop.enabled : false,
				interval: options.loop?.interval || options.interval || 5000, // intervalとして統合（互換性のため外部のintervalも参照）
			},

			// ドラッグ機能
			draggable: options.draggable !== undefined ? options.draggable : true,

			// シームレスモード
			// true: ドラッグ中もリアルタイムで進捗率とクラスが変化
			// false: クリック時またはドラッグ終了時のみ進捗率とクラスが変化
			seamless: options.seamless !== undefined ? options.seamless : true,

			// スライドクラス名
			slideClasses: {
				active: options.slideClasses?.active || "carousel-slide-active",
				prev: options.slideClasses?.prev || "carousel-slide-prev",
				next: options.slideClasses?.next || "carousel-slide-next",
			},

			// スライド配置位置（start, center, endのいずれか）
			align: options.align || options.snapPosition || "center",

			// スライド配置モード
			// "edge": 両端のスライドは端に配置（デフォルト）
			// "all": すべてのスライドを指定位置に配置
			alignMode: options.alignMode || options.centerMode || "edge",
		};

		// ナビゲーションボタンの取得
		if (this.options.navigation.enabled) {
			this.prevBtn = document.querySelector(this.options.navigation.prevEl);
			this.nextBtn = document.querySelector(this.options.navigation.nextEl);
		}

		// ページネーション要素の取得
		if (this.options.pagination.enabled) {
			this.indicators = document.querySelector(this.options.pagination.el);
		}

		// 状態管理
		this.currentIndex = 0;
		this.itemCount = this.items.length;
		this.autoplayInterval = null;
		this.autoplayTimeout = null;
		this.isTransitioning = false;

		// 各スライドの幅と高さを保存するための配列
		this.itemWidths = new Array(this.itemCount).fill(0);
		this.itemHeights = new Array(this.itemCount).fill(0);

		this.containerWidth = 0;
		this.containerHeight = 0;
		this.gapSize = this.options.gap;

		// ドラッグ関連の状態
		this.isDragging = false;
		this.startPos = 0;
		this.currentTranslate = 0;
		this.prevTranslate = 0;
		this.animationID = 0;
		this.dragStartTime = 0;
		this.dragDistance = 0;
		this.currentSlideOffset = 0; // 現在のスライドのオフセット位置

		// アニメーション関連の状態
		this.animationStartTime = 0;
		this.animationStartPosition = 0;
		this.animationEndPosition = 0;
		this.animationFrameId = 0;

		// 長押し/ドラッグ開始直後のフラグを設定（進捗率計算用）
		this.dragStartImmediate = true;

		// 現在の各スライドの進捗率を保存（長押し時の誤差防止用）
		this.dragStartProgressValues = [];
		this.items.forEach((item, index) => {
			this.dragStartProgressValues[index] = parseFloat(getComputedStyle(item).getPropertyValue("--progress") || 0);
		});

		// 初期化
		this.init();
	}

	init() {
		// カルーセルの方向に応じたスタイル設定
		this.setupCarouselStyles();

		// ページネーションの作成
		if (this.options.pagination.enabled) {
			this.createIndicators();
		}

		// ナビゲーションのイベントリスナー設定
		if (this.options.navigation.enabled && this.prevBtn && this.nextBtn) {
			this.prevBtn.addEventListener("click", () => {
				// イベント発火
				this.emit("beforeNavigation", { direction: "prev", currentIndex: this.currentIndex });

				// ループが有効な場合、最初のスライドで前へボタンを押すと最後のスライドへ
				if (this.currentIndex === 0 && this.options.loop.enabled) {
					this.goToSlide(this.itemCount - 1);
				} else {
					this.prev();
				}
				this.resetAutoplay(); // 自動再生をリセット

				// イベント発火
				this.emit("afterNavigation", { direction: "prev", currentIndex: this.currentIndex });
			});

			this.nextBtn.addEventListener("click", () => {
				// イベント発火
				this.emit("beforeNavigation", { direction: "next", currentIndex: this.currentIndex });

				// ループが有効な場合、最後のスライドで次へボタンを押すと最初のスライドへ
				if (this.currentIndex === this.itemCount - 1 && this.options.loop.enabled) {
					this.goToSlide(0);
				} else {
					this.next();
				}
				this.resetAutoplay(); // 自動再生をリセット

				// イベント発火
				this.emit("afterNavigation", { direction: "next", currentIndex: this.currentIndex });
			});
		}

		// 自動再生の設定
		if (this.options.autoplay) {
			this.startAutoplay();

			// マウスオーバー時の自動再生停止（オプションで制御）
			if (this.options.pauseOnHover) {
				this.carousel.addEventListener("mouseenter", () => this.stopAutoplay());
				this.carousel.addEventListener("mouseleave", () => this.startAutoplay());
			}
		}

		// ドラッグ機能の設定
		if (this.options.draggable) {
			this.setupDragEvents();
		}

		// ウィンドウリサイズ時にアイテムサイズを再計算
		window.addEventListener("resize", () => {
			this.calculateItemSize();
			this.goToSlide(this.currentIndex, false);
		});

		// 初期表示
		this.calculateItemSize();
		this.goToSlide(0, false);

		// 初期化完了イベント発火
		this.emit("init", { carousel: this });
	}

	setupCarouselStyles() {
		// 方向に応じたクラスを設定
		if (this.options.direction === "vertical") {
			this.carousel.classList.add("vertical");
			this.carousel.classList.remove("horizontal");
		} else {
			this.carousel.classList.add("horizontal");
			this.carousel.classList.remove("vertical");
		}

		// ドラッグ可能な場合のクラスを設定
		if (this.options.draggable) {
			this.carousel.classList.add("draggable");
		} else {
			this.carousel.classList.remove("draggable");
		}

		// 各アイテムのスタイル設定（ギャップのみ動的に設定）
		this.items.forEach((item, index) => {
			if (this.options.direction === "vertical") {
				// 垂直方向の場合のギャップ
				if (this.options.gap > 0) {
					item.style.marginBottom = index < this.itemCount - 1 ? `${this.options.gap}px` : "0";
					item.style.marginRight = "0"; // 水平マージンをリセット
				}
			} else {
				// 水平方向の場合のギャップ
				if (this.options.gap > 0) {
					item.style.marginRight = index < this.itemCount - 1 ? `${this.options.gap}px` : "0";
					item.style.marginBottom = "0"; // 垂直マージンをリセット
				}
			}

			// 初期進捗率をCSS変数として設定
			item.style.setProperty("--progress", "0");
		});

		// 初期クラスの設定
		this.updateSlideClasses();

		// 初期アクティブスライドの進捗率を1に設定
		if (this.items[0]) {
			this.items[0].style.setProperty("--progress", "1");
		}
	}

	setupDragEvents() {
		// タッチイベント
		this.carousel.addEventListener("touchstart", this.dragStart.bind(this), { passive: false });
		this.carousel.addEventListener("touchmove", this.dragMove.bind(this), { passive: false });
		this.carousel.addEventListener("touchend", this.dragEnd.bind(this));
		this.carousel.addEventListener("touchcancel", this.dragEnd.bind(this));

		// マウスイベント - イベントリスナーを一度だけ追加するように修正
		this.carousel.addEventListener("mousedown", this.dragStart.bind(this));

		// グローバルイベントリスナーは一度だけ追加
		this.boundDragMove = this.dragMove.bind(this);
		this.boundDragEnd = this.dragEnd.bind(this);

		window.addEventListener("mousemove", this.boundDragMove);
		window.addEventListener("mouseup", this.boundDragEnd);
	}

	// 現在のオフセット位置を更新
	updateCurrentOffset() {
		if (this.options.direction === "horizontal") {
			// スナップ位置に基づいてオフセットを計算
			const slidePosition = this.calculateSlidePosition(this.currentIndex);
			this.currentSlideOffset = -slidePosition;
		} else {
			// 垂直方向の場合
			const baseOffset = this.currentIndex * this.itemHeight;
			const gapOffset = this.currentIndex * this.gapSize;
			this.currentSlideOffset = -(baseOffset + gapOffset);
		}
	}

	// スライドの位置を計算（配置位置を考慮）
	calculateSlidePosition(index) {
		const isFirstSlide = index === 0;
		const isLastSlide = index === this.itemCount - 1;
		const isSecondLastSlide = index === this.itemCount - 2;
		const isSecondSlide = index === 1;

		// 基本的な位置計算（スライドの左端）
		let position = 0;

		// 各スライドの累積幅を計算（特定のインデックスまで）
		for (let i = 0; i < index; i++) {
			// 各スライドの実際の横幅とギャップを加算
			position += this.itemWidths[i] + this.gapSize;
		}

		// 現在のスライドの幅を取得
		const currentSlideWidth = this.itemWidths[index] || 0;

		// 特定の条件下では端のスライドを優先する
		if (this.options.alignMode === "edge") {
			// startで最後から2番目のスライドが選択された場合、最後のスライドに移動
			if (this.options.align === "start" && isSecondLastSlide) {
				// 最後のスライドのコンテナからのはみ出しをチェック
				const lastSlidePosition = this.calculateLastSlidePosition();
				const maxPosition = this.calculateMaxPosition();

				// 最後のスライドをコンテナに収めるには最大位置に移動する必要がある場合
				// 最後のスライドの位置に直接移動
				if (lastSlidePosition > maxPosition - this.gapSize) {
					return maxPosition;
				}
			}

			// endで2番目のスライドが選択された場合、最初のスライドに移動
			if (this.options.align === "end" && isSecondSlide) {
				// 先頭のスライドのコンテナからのはみ出しをチェック
				const secondSlideEndPosition = this.itemWidths[0] + this.gapSize + this.itemWidths[1];

				// 2番目のスライドが右端にくると1番目がはみ出る場合
				if (secondSlideEndPosition > this.containerWidth) {
					return 0; // 最初のスライドの位置に直接移動
				}
			}
		}

		// 配置位置に基づいて調整
		switch (this.options.align) {
			case "center":
				// 中央揃え
				position = position - (this.containerWidth / 2 - currentSlideWidth / 2);

				// alignModeに基づいて調整
				if (this.options.alignMode === "edge") {
					// 両端のスライドは端に合わせる（デフォルト）
					if (isFirstSlide) {
						position = 0;
					} else if (isLastSlide) {
						position = this.calculateMaxPosition();
					}
				}
				// "all"の場合は調整不要（すべて中央揃え）
				break;

			case "end":
				// 右端揃え
				position = position - (this.containerWidth - currentSlideWidth);

				// alignModeに基づいて調整
				if (this.options.alignMode === "edge") {
					// 両端のスライドは端に合わせる
					if (isFirstSlide) {
						position = 0; // 最初のスライドは左端に配置
					} else if (isLastSlide) {
						position = this.calculateMaxPosition();
					}
				}
				break;

			case "start":
			default:
				// 左端揃え (デフォルト)

				// alignModeに基づいて調整
				if (this.options.alignMode === "edge") {
					// 両端のスライドは端に合わせる
					if (isFirstSlide) {
						position = 0;
					} else if (isLastSlide) {
						position = this.calculateMaxPosition();
					}
				}
				// "all"の場合は何も調整しない
				break;
		}

		// 最初のスライドが中央揃えになるように特別処理
		if (this.options.align === "center" && this.options.alignMode === "all") {
			// マイナス値も許可（最初のスライドを中央に配置するため）
			return position;
		} else if (this.options.align === "end" && this.options.alignMode === "all") {
			// 右端揃えの場合も必要に応じて制限を緩和
			return position;
		} else if (this.options.align === "start" && this.options.alignMode === "all") {
			// 左端揃えの場合もそのまま返す
			return position;
		}

		// 通常時はマイナスになる場合は0に制限
		return Math.max(0, position);
	}

	// 最大移動位置を計算
	calculateMaxPosition() {
		// 全スライドの長さを計算（各スライドの実際の幅を使用）
		let totalSlidesWidth = 0;
		for (let i = 0; i < this.itemCount; i++) {
			totalSlidesWidth += this.itemWidths[i];
		}

		// ギャップの総計を追加
		totalSlidesWidth += this.gapSize * (this.itemCount - 1);

		// 表示エリアを引いた値が最大移動位置
		return Math.max(0, totalSlidesWidth - this.containerWidth);
	}

	// ドラッグ開始の処理
	dragStart(event) {
		// マウスの場合、左クリック以外は無視
		if (event.type === "mousedown" && event.button !== 0) return;

		// すでにドラッグ中なら何もしない（重複防止）
		if (this.isDragging) return;

		// イベントのデフォルト動作を防止（スクロールなど）
		if (event.cancelable) {
			event.preventDefault();
		}

		// 自動再生を一時停止
		if (this.options.autoplay) {
			this.stopAutoplay();
		}

		// アニメーション中の場合、アニメーションを即時停止
		if (this.isTransitioning) {
			// 進行中のアニメーションをキャンセル
			this.stopAnimation();
			this.isTransitioning = false;
		}

		this.isDragging = true;
		this.dragStartTime = new Date().getTime();
		this.dragDistance = 0;

		// 開始位置を記録
		if (this.options.direction === "horizontal") {
			this.startPos = this.getPositionX(event);
		} else {
			this.startPos = this.getPositionY(event);
		}

		// 現在の実際の変換値を取得（計算ではなく実際のDOM値から）
		this.prevTranslate = this.getCurrentTranslate();

		// 現在のアクティブスライドの状態をマーク（長押し時用）
		this.dragStartSlideIndex = this.currentIndex;

		// 長押し/ドラッグ開始直後のフラグを設定（進捗率計算用）
		this.dragStartImmediate = true;

		// 現在の各スライドの進捗率を保存（長押し時の誤差防止用）
		this.dragStartProgressValues = [];
		this.items.forEach((item, index) => {
			this.dragStartProgressValues[index] = parseFloat(getComputedStyle(item).getPropertyValue("--progress") || 0);
		});

		// アニメーションフレームを開始
		cancelAnimationFrame(this.animationID);
		this.animationID = requestAnimationFrame(this.animation.bind(this));

		// ドラッグ開始イベント発火
		this.emit("dragStart", {
			startPosition: this.startPos,
			currentIndex: this.currentIndex,
		});

		// dragStartが走った時に一度dragMoveも実行（カクつき防止）
		this.dragMove(event);
	}

	dragMove(event) {
		if (!this.isDragging) return;

		// イベントのデフォルト動作を防止（スクロールなど）
		if (event.cancelable) {
			event.preventDefault();
		}

		let currentPosition;
		if (this.options.direction === "horizontal") {
			currentPosition = this.getPositionX(event);
		} else {
			currentPosition = this.getPositionY(event);
		}

		// 移動距離を計算
		this.dragDistance = currentPosition - this.startPos;

		// 現在の変換値を計算
		this.currentTranslate = this.prevTranslate + this.dragDistance;

		// ループが無効な場合、端での引っ張りを制限
		if (!this.options.loop.enabled) {
			// allモードの場合は特別処理
			if (this.options.align === "center" && this.options.alignMode === "all") {
				// 最初のスライドのオフセット位置を計算（マイナス値になる可能性あり）
				const firstSlideOffset = this.containerWidth / 2 - this.itemWidths[0] / 2;
				const maxTranslate = firstSlideOffset; // 最初のスライドが中央に来る位置
				const minTranslate = this.getMinTranslate();

				if (this.currentTranslate > maxTranslate) {
					// 最初のスライドより前に引っ張る場合
					this.currentTranslate = maxTranslate + (this.currentTranslate - maxTranslate) * 0.3; // 抵抗を加える
				} else if (this.currentTranslate < minTranslate) {
					// 最後のスライドより後ろに引っ張る場合
					const overDrag = this.currentTranslate - minTranslate;
					this.currentTranslate = minTranslate + overDrag * 0.3; // 抵抗を加える
				}
			} else {
				// 通常の制限（従来の処理）
				const maxTranslate = 0;
				const minTranslate = this.getMinTranslate();

				if (this.currentTranslate > maxTranslate) {
					// 最初のスライドより前に引っ張る場合
					this.currentTranslate = maxTranslate + (this.currentTranslate - maxTranslate) * 0.3; // 抵抗を加える
				} else if (this.currentTranslate < minTranslate) {
					// 最後のスライドより後ろに引っ張る場合
					const overDrag = this.currentTranslate - minTranslate;
					this.currentTranslate = minTranslate + overDrag * 0.3; // 抵抗を加える
				}
			}
		}

		// ドラッグ中のスライドインデックスと進捗率を計算
		this.updateDragProgress();

		// ドラッグ移動イベント発火
		this.emit("dragMove", {
			distance: this.dragDistance,
			translate: this.currentTranslate,
			progressValues: this.calculatedProgressValues,
		});
	}

	dragEnd(event) {
		// ドラッグ状態でない場合は何もしない
		if (!this.isDragging) return;

		// ドラッグ状態を解除（最初に行う）
		this.isDragging = false;

		// ドラッグ開始関連のフラグとデータをリセット
		this.dragStartSlideIndex = undefined;
		this.dragStartImmediate = false;

		// アニメーションフレームをキャンセル
		cancelAnimationFrame(this.animationID);
		this.animationID = 0;

		// ドラッグ時間と速度を計算
		const dragTime = new Date().getTime() - this.dragStartTime;
		const dragSpeed = Math.abs(this.dragDistance) / dragTime; // ピクセル/ミリ秒
		const quickSwipe = dragTime < 250 && Math.abs(this.dragDistance) > 20;

		// スライドの幅に対する移動距離の割合を計算
		const itemSize = this.getItemSize(this.currentIndex);
		const moveRatio = Math.abs(this.dragDistance) / itemSize;

		// 現在の進捗率を取得
		let progressValues = [];
		if (this.options.seamless) {
			// シームレスモードでは現在のDOM値から取得
			this.items.forEach((item, index) => {
				progressValues[index] = parseFloat(getComputedStyle(item).getPropertyValue("--progress") || 0);
			});
		} else {
			// 非シームレスモードでは計算した値を使用
			progressValues = Array.from(this.calculatedProgressValues || []);

			// 計算値がない場合（ほとんどドラッグしていない場合など）
			if (!progressValues.length || progressValues.every((val) => val === 0)) {
				// 現在のDOM値を取得し、明示的に現在のスライドの進捗率を1に設定
				this.items.forEach((item, index) => {
					progressValues[index] = index === this.currentIndex ? 1 : 0;
				});
			}
		}

		// ほとんど動いていない場合（長押しと判断）
		if (Math.abs(this.dragDistance) < 15) {
			// 長押しの場合は現在のスライドに戻る
			this.goToSlideWithProgress(this.currentIndex, progressValues);

			// 自動再生を再開して終了
			if (this.options.autoplay) {
				this.startAutoplay();
			}
			return;
		}

		// ドラッグ中のアクティブインデックスを計算
		const scrollPosition = Math.abs(this.currentTranslate);
		let targetIndex = this.currentIndex;

		// 各スライドの位置との距離を計算し、最も近いスライドを特定
		let bestMatchIndex = 0;
		let minDistance = Infinity;
		const slidePositions = [];

		for (let i = 0; i < this.itemCount; i++) {
			const slidePosition = this.calculateSlidePosition(i);
			slidePositions[i] = slidePosition;

			const distance = Math.abs(scrollPosition - slidePosition);
			if (distance < minDistance) {
				minDistance = distance;
				bestMatchIndex = i;
			}
		}

		// 移動量に基づいてスライドを決定
		if (moveRatio > 0.5) {
			// スライドの50%以上が移動した場合、その方向にスライド
			if (this.dragDistance < 0) {
				// 左/上にドラッグ → 次のスライドへ
				targetIndex = this.currentIndex + 1;
			} else {
				// 右/下にドラッグ → 前のスライドへ
				targetIndex = this.currentIndex - 1;
			}
		} else if (quickSwipe || (dragSpeed > 0.5 && moveRatio > 0.1)) {
			// クイックスワイプ、または速度が速く、かつ少なくとも10%以上移動した場合
			if (this.dragDistance < 0) {
				targetIndex = this.currentIndex + 1;
			} else {
				targetIndex = this.currentIndex - 1;
			}
		} else {
			// 元の位置に戻す - 現在のインデックスに戻る
			targetIndex = this.currentIndex;
		}

		// インデックスを範囲内に制限
		if (this.options.loop.enabled) {
			if (targetIndex < 0) {
				targetIndex = this.itemCount - 1;
			} else if (targetIndex >= this.itemCount) {
				targetIndex = 0;
			}
		} else {
			if (targetIndex < 0) {
				targetIndex = 0;
			} else if (targetIndex >= this.itemCount) {
				targetIndex = this.itemCount - 1;
			}
		}

		// 特殊な端の処理（alignModeがedgeの場合）
		if (this.options.alignMode === "edge" && !this.options.loop.enabled) {
			// startの場合、最後から2番目のスライドに移動しようとしたとき、最後のスライドがはみ出すなら最後のスライドへ直接移動
			if (this.options.align === "start" && targetIndex === this.itemCount - 2) {
				const lastSlidePosition = this.calculateLastSlidePosition();
				const maxPosition = this.calculateMaxPosition();

				if (lastSlidePosition > maxPosition - this.gapSize) {
					targetIndex = this.itemCount - 1;
				}
			}

			// endの場合、2番目のスライドに移動しようとしたとき、最初のスライドがはみ出すなら最初のスライドへ直接移動
			if (this.options.align === "end" && targetIndex === 1) {
				const secondSlideEndPosition = this.itemWidths[0] + this.gapSize + this.itemWidths[1];

				if (secondSlideEndPosition > this.containerWidth) {
					targetIndex = 0;
				}
			}
		}

		// ドラッグ終了イベント発火
		this.emit("dragEnd", {
			distance: this.dragDistance,
			duration: new Date().getTime() - this.dragStartTime,
			targetIndex: targetIndex,
			currentIndex: this.currentIndex,
		});

		// スライド移動（両モードとも同じ処理を使用）
		this.goToSlideWithProgress(targetIndex, progressValues);

		// 自動再生を再開
		if (this.options.autoplay) {
			this.startAutoplay();
		}
	}

	getPositionX(event) {
		// タッチイベントとマウスイベントの両方に対応
		if (event.type.includes("mouse")) {
			return event.clientX;
		} else {
			// touchesが存在しない場合（touchendイベントなど）はreturn
			if (!event.touches || event.touches.length === 0) {
				return 0;
			}
			return event.touches[0].clientX;
		}
	}

	getPositionY(event) {
		// タッチイベントとマウスイベントの両方に対応
		if (event.type.includes("mouse")) {
			return event.clientY;
		} else {
			// touchesが存在しない場合（touchendイベントなど）はreturn
			if (!event.touches || event.touches.length === 0) {
				return 0;
			}
			return event.touches[0].clientY;
		}
	}

	getMinTranslate() {
		// 最後のスライドの位置を計算
		const itemSize = this.getItemSize(this.itemCount - 1);
		const gapTotal = (this.itemCount - 1) * this.gapSize;

		// allモードの場合、最後のスライドも指定位置に配置する
		if (this.options.alignMode === "all") {
			const totalSlidesWidth = this.itemWidths[this.itemCount - 1] + gapTotal;

			if (this.options.align === "center") {
				return -(totalSlidesWidth - this.itemWidths[this.itemCount - 1] - (this.containerWidth - this.itemWidths[this.itemCount - 1]) / 2);
			} else if (this.options.align === "end") {
				return -(totalSlidesWidth - this.containerWidth);
			} else {
				// startの場合
				return -(totalSlidesWidth - this.itemWidths[this.itemCount - 1]);
			}
		}

		// 通常の計算
		return -((this.itemCount - 1) * itemSize + gapTotal);
	}

	getItemSize(index) {
		if (this.options.direction === "horizontal") {
			return this.itemWidths[index];
		} else {
			return this.itemHeights[index];
		}
	}

	getCurrentTranslate() {
		// 現在のtransform値を取得
		const style = window.getComputedStyle(this.carousel);
		const transform = style.transform || style.webkitTransform;

		if (transform === "none") {
			return 0;
		}

		// 行列値を解析
		let matrix;
		try {
			matrix = new DOMMatrix(transform);

			if (this.options.direction === "horizontal") {
				return matrix.m41; // translateX値
			} else {
				return matrix.m42; // translateY値
			}
		} catch (e) {
			// DOMMatrixがサポートされていない場合
			try {
				// 正規表現でtransform値を抽出
				const values = transform.match(/matrix(?:3d)?\(([^)]+)\)/);
				if (!values || !values[1]) return 0;

				const matrixValues = values[1].split(",").map((v) => parseFloat(v.trim()));

				// matrix(a, b, c, d, tx, ty) または matrix3d(...)
				if (matrixValues.length === 6) {
					// 2D matrix
					return this.options.direction === "horizontal" ? matrixValues[4] : matrixValues[5];
				} else if (matrixValues.length === 16) {
					// 3D matrix
					return this.options.direction === "horizontal" ? matrixValues[12] : matrixValues[13];
				}
				return 0;
			} catch (err) {
				console.error("Transform解析エラー:", err);
				return 0;
			}
		}
	}

	animation() {
		if (this.isDragging) {
			// 次のフレームをリクエスト（パフォーマンス向上）
			this.animationID = requestAnimationFrame(this.animation.bind(this));
			// 位置を更新
			this.setSliderPosition();
		}
	}

	setSliderPosition() {
		// transform3dのみを動的に設定
		if (this.options.direction === "horizontal") {
			this.carousel.style.transform = `translate3d(${this.currentTranslate}px, 0, 0)`;
		} else {
			this.carousel.style.transform = `translate3d(0, ${this.currentTranslate}px, 0)`;
		}
	}

	// JSアニメーションを開始
	startAnimation(startPosition, endPosition, duration) {
		// 既存のアニメーションを停止
		this.stopAnimation();

		this.isTransitioning = true;
		this.animationStartTime = performance.now();
		this.animationStartPosition = startPosition;
		this.animationEndPosition = endPosition;
		this.animationDuration = duration * 1000; // 秒からミリ秒に変換

		// アニメーションフレームを開始
		this.animationFrameId = requestAnimationFrame(this.updateAnimation.bind(this));
	}

	// アニメーションフレームの更新
	updateAnimation(timestamp) {
		if (!this.isTransitioning) return;

		const elapsed = timestamp - this.animationStartTime;
		const progress = Math.min(elapsed / this.animationDuration, 1);

		// イージング関数を適用
		const easedProgress = this.applyEasing(progress);

		// 現在位置を計算
		const currentPosition = this.animationStartPosition + (this.animationEndPosition - this.animationStartPosition) * easedProgress;

		// 位置を設定（transform3dを使用）
		if (this.options.direction === "horizontal") {
			this.carousel.style.transform = `translate3d(${currentPosition}px, 0, 0)`;
		} else {
			this.carousel.style.transform = `translate3d(0, ${currentPosition}px, 0)`;
		}

		// シームレスモードの場合のみ進捗率を継続的に更新
		if (this.options.seamless) {
			this.updateProgressDuringAnimation(easedProgress);
		} else if (progress === 1) {
			// 非シームレスモードではアニメーション完了時のみ進捗率を更新
			this.updateProgressDuringAnimation(easedProgress);
		}

		// アニメーションが完了していない場合は次のフレームをリクエスト
		if (progress < 1) {
			this.animationFrameId = requestAnimationFrame(this.updateAnimation.bind(this));
		} else {
			// アニメーション完了
			this.isTransitioning = false;
			this.updateCurrentOffset();

			// 最終的なスライドクラスの更新
			this.updateSlideClasses();

			// アニメーション完了時の進捗率更新
			if (this.options.seamless) {
				this.updateFinalProgress();
			} else {
				// 非シームレスモードでは最終的な進捗率をアニメーション完了時に設定
				this.updateFinalProgress();
			}
		}
	}

	// イージング関数を適用
	applyEasing(progress) {
		// 基本的なイージング関数
		switch (this.options.easing) {
			case "linear":
				return progress;
			case "ease-in":
				return progress * progress;
			case "ease-out":
				return 1 - Math.pow(1 - progress, 2);
			case "ease-in-out":
				return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
			default:
				// cubic-bezier値の処理
				if (typeof this.options.easing === "string" && this.options.easing.startsWith("cubic-bezier")) {
					try {
						// 括弧内の値を取得（負の値も含む）
						const values = this.options.easing.match(/cubic-bezier\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/);
						if (values && values.length === 5) {
							const p1x = parseFloat(values[1]);
							const p1y = parseFloat(values[2]);
							const p2x = parseFloat(values[3]);
							const p2y = parseFloat(values[4]);
							return this.cubicBezier(p1x, p1y, p2x, p2y, progress);
						} else {
							console.warn("cubic-bezier値の解析に失敗しました:", this.options.easing);
						}
					} catch (e) {
						console.warn("cubic-bezier解析エラー:", e);
					}
				}

				// デフォルトのeaseカーブ
				// ユーザー指定のeaseカーブが解析できなかった場合
				return this.cubicBezier(0.25, 0.1, 0.25, 1.0, progress);
		}
	}

	// キュービックベジェ関数の改善版
	cubicBezier(p1x, p1y, p2x, p2y, t) {
		// ニュートン法でtを求める
		let x = t;

		// 精度を上げるためのイテレーション
		for (let i = 0; i < 4; i++) {
			const currentX = this.getCubicBezierPoint(p1x, p2x, x);
			const derivative = this.getCubicBezierDerivative(p1x, p2x, x);
			if (Math.abs(derivative) < 0.0001) break;
			x = x - (currentX - t) / derivative;
		}

		// 対応するy値を計算
		return this.getCubicBezierPoint(p1y, p2y, x);
	}

	// ベジェ曲線上の点を計算
	getCubicBezierPoint(p1, p2, t) {
		return 3 * p1 * (1 - t) * (1 - t) * t + 3 * p2 * (1 - t) * t * t + t * t * t;
	}

	// ベジェ曲線の導関数
	getCubicBezierDerivative(p1, p2, t) {
		return 3 * (1 - t) * (1 - t) * p1 + 6 * (1 - t) * t * (p2 - p1) + 3 * t * t * (1 - p2);
	}

	// アニメーションを停止
	stopAnimation() {
		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = 0;
		}
		this.isTransitioning = false;
	}

	calculateItemSize() {
		// コンテナのサイズを取得
		const containerRect = this.container.getBoundingClientRect();
		this.containerWidth = containerRect.width;
		this.containerHeight = containerRect.height;

		// 各スライドのサイズを個別に取得（CSSで設定されたサイズを反映）
		this.items.forEach((item, index) => {
			// 一時的に表示して計測（非表示の場合に備えて）
			const originalVisibility = item.style.visibility;
			const originalPosition = item.style.position;

			item.style.visibility = "hidden";
			item.style.position = "absolute";

			// 実際のアイテムサイズを計測して保存
			const itemRect = item.getBoundingClientRect();
			this.itemWidths[index] = itemRect.width;
			this.itemHeights[index] = itemRect.height;

			// 元の状態に戻す
			item.style.visibility = originalVisibility;
			item.style.position = originalPosition;
		});

		// サイズ変更後に現在のオフセット位置を更新
		this.updateCurrentOffset();
	}

	createIndicators() {
		if (!this.indicators) return;

		// 既存のインジケーターをクリア
		this.indicators.innerHTML = "";

		for (let i = 0; i < this.itemCount; i++) {
			const indicator = document.createElement("div");
			indicator.classList.add("indicator");

			if (this.options.pagination.clickable) {
				indicator.addEventListener("click", () => {
					this.goToSlide(i);
					this.resetAutoplay(); // 自動再生をリセット
				});
			}

			this.indicators.appendChild(indicator);
		}
	}

	goToSlide(index, animate = true) {
		// インデックスの正規化
		let targetIndex = index;

		if (this.options.loop.enabled) {
			if (index < 0) {
				targetIndex = this.itemCount - 1;
			} else if (index >= this.itemCount) {
				targetIndex = 0;
			}
		} else {
			// ループなしの場合は端で止める
			if (index < 0) {
				targetIndex = 0;
			} else if (index >= this.itemCount) {
				targetIndex = this.itemCount - 1;
			}
		}

		// 現在の進捗率を取得して進捗率ベースのアニメーションを使用
		const progressValues = [];
		this.items.forEach((item, idx) => {
			progressValues[idx] = parseFloat(getComputedStyle(item).getPropertyValue("--progress") || 0);
		});

		// goToSlideWithProgressを使用して、スムーズな進捗率遷移を実現
		this.goToSlideWithProgress(targetIndex, progressValues);
	}

	next() {
		// 特殊な端の処理
		if (this.options.alignMode === "edge" && !this.options.loop.enabled) {
			// startの場合、最後から2番目のスライドのとき、一気に最後のスライドへ
			if (this.options.align === "start" && this.currentIndex === this.itemCount - 2) {
				const lastSlidePosition = this.calculateLastSlidePosition();
				const maxPosition = this.calculateMaxPosition();

				if (lastSlidePosition > maxPosition - this.gapSize) {
					this.goToSlide(this.itemCount - 1);
					return;
				}
			}
		}

		// 通常の次へ移動
		this.goToSlide(this.currentIndex + 1);
	}

	prev() {
		// 特殊な端の処理
		if (this.options.alignMode === "edge" && !this.options.loop.enabled) {
			// endの場合、2番目のスライドのとき、一気に最初のスライドへ
			if (this.options.align === "end" && this.currentIndex === 1) {
				const secondSlideEndPosition = this.itemWidths[0] + this.gapSize + this.itemWidths[1];

				if (secondSlideEndPosition > this.containerWidth) {
					this.goToSlide(0);
					return;
				}
			}
		}

		// 通常の前へ移動
		this.goToSlide(this.currentIndex - 1);
	}

	startAutoplay() {
		// 既存の自動再生をクリア
		this.stopAutoplay();

		if (this.options.autoplay) {
			// 自動再生開始イベント発火
			this.emit("autoplayStart");

			this.autoplayInterval = setInterval(() => {
				// 最後のスライドで、ループが有効でない場合
				if (this.currentIndex === this.itemCount - 1 && !this.options.loop.enabled) {
					// 自動再生を完全に停止
					this.stopAutoplay();
					return;
				} else if (this.currentIndex === this.itemCount - 1 && this.options.loop.enabled) {
					// ループが有効な場合は最初のスライドへ
					this.goToSlide(0);
				} else {
					// 通常の次へ移動
					this.next();
				}
			}, this.options.loop.interval); // intervalの参照先を変更
		}
	}

	stopAutoplay() {
		// インターバルをクリア
		if (this.autoplayInterval) {
			clearInterval(this.autoplayInterval);
			this.autoplayInterval = null;

			// 自動再生停止イベント発火
			this.emit("autoplayStop");
		}

		// タイムアウトもクリア
		if (this.autoplayTimeout) {
			clearTimeout(this.autoplayTimeout);
			this.autoplayTimeout = null;
		}
	}

	resetAutoplay() {
		// 自動再生が有効な場合、リセット
		if (this.options.autoplay) {
			this.stopAutoplay();
			this.startAutoplay();
		}
	}

	// スライドのクラスを更新するメソッド
	updateSlideClasses(dragIndex = null) {
		const activeIndex = dragIndex !== null ? dragIndex : this.currentIndex;

		// すべてのクラスをリセット
		this.items.forEach((item, index) => {
			item.classList.remove(this.options.slideClasses.active);
			item.classList.remove(this.options.slideClasses.prev);
			item.classList.remove(this.options.slideClasses.next);
		});

		// アクティブなスライドにクラスを追加
		if (this.items[activeIndex]) {
			this.items[activeIndex].classList.add(this.options.slideClasses.active);
		}

		// 前のスライド
		const prevIndex = activeIndex - 1;
		if (prevIndex >= 0 && this.items[prevIndex]) {
			this.items[prevIndex].classList.add(this.options.slideClasses.prev);
		} else if (this.options.loop.enabled && this.items[this.itemCount - 1]) {
			// ループが有効な場合、最後のスライドを前として処理
			this.items[this.itemCount - 1].classList.add(this.options.slideClasses.prev);
		}

		// 次のスライド
		const nextIndex = activeIndex + 1;
		if (nextIndex < this.itemCount && this.items[nextIndex]) {
			this.items[nextIndex].classList.add(this.options.slideClasses.next);
		} else if (this.options.loop.enabled && this.items[0]) {
			// ループが有効な場合、最初のスライドを次として処理
			this.items[0].classList.add(this.options.slideClasses.next);
		}
	}

	// ドラッグ中の進捗率とインデックスを更新
	updateDragProgress() {
		// ドラッグ直後や長押し判定の設定
		const isSmallDrag = Math.abs(this.dragDistance) < 15;
		const isDragJustStarted = this.dragStartImmediate || new Date().getTime() - this.dragStartTime < 200;

		// 長押しやわずかな動きの場合は開始時のインデックスを維持
		if ((isSmallDrag && isDragJustStarted) || (isSmallDrag && this.dragStartSlideIndex === 0)) {
			const bestMatchIndex = this.dragStartSlideIndex;

			// 開始時に保存した進捗率を使用
			if (this.options.seamless) {
				this.items.forEach((item, index) => {
					const savedProgress = this.dragStartProgressValues[index] || 0;
					item.style.setProperty("--progress", savedProgress.toString());
				});

				// スライドクラスのみ更新して終了
				this.updateSlideClasses(bestMatchIndex);
			}

			// 非シームレスモードの場合も計算値を初期化
			this.calculatedProgressValues = [...this.dragStartProgressValues];

			return;
		}

		// ドラッグ開始直後フラグをオフに
		if (this.dragStartImmediate && Math.abs(this.dragDistance) > 15) {
			this.dragStartImmediate = false;
		}

		// スライドのスナップ位置情報を収集
		const snapPositions = [];
		for (let i = 0; i < this.itemCount; i++) {
			snapPositions.push(this.calculateSlidePosition(i));
		}

		// 現在位置
		const currentPosition = -this.currentTranslate;

		// 現在位置を挟む2つのスナップ位置とそのインデックスを特定
		let leftIndex = -1;
		let rightIndex = -1;
		let leftPosition = 0;
		let rightPosition = 0;

		// 現在位置に最も近いスナップ位置を特定
		let closestIndex = 0;
		let minDistance = Infinity;

		for (let i = 0; i < this.itemCount; i++) {
			const distance = Math.abs(currentPosition - snapPositions[i]);
			if (distance < minDistance) {
				minDistance = distance;
				closestIndex = i;
			}

			// 現在位置の左側にあるスナップ位置
			if (snapPositions[i] <= currentPosition && (leftIndex === -1 || snapPositions[i] > leftPosition)) {
				leftIndex = i;
				leftPosition = snapPositions[i];
			}
			// 現在位置の右側にあるスナップ位置
			if (snapPositions[i] >= currentPosition && (rightIndex === -1 || snapPositions[i] < rightPosition)) {
				rightIndex = i;
				rightPosition = snapPositions[i];
			}
		}

		// 端の位置の特殊処理
		if (leftIndex === -1) {
			leftIndex = 0;
			leftPosition = snapPositions[0];
		}
		if (rightIndex === -1) {
			rightIndex = this.itemCount - 1;
			rightPosition = snapPositions[this.itemCount - 1];
		}

		// 2つのスナップ位置が同じ場合（ちょうどスナップ位置にいる場合）
		if (leftIndex === rightIndex) {
			// このスライドのみ進捗率1、他は0
			if (this.options.seamless) {
				this.items.forEach((item, index) => {
					item.style.setProperty("--progress", index === leftIndex ? "1" : "0");
				});
				this.updateSlideClasses(leftIndex);
			}

			// 非シームレスモードでも計算は行う（ドラッグ終了時用）
			this.calculatedProgressValues = [];
			for (let i = 0; i < this.itemCount; i++) {
				this.calculatedProgressValues[i] = i === leftIndex ? 1 : 0;
			}
			this.calculatedActiveIndex = leftIndex;

			return;
		}

		// スナップ位置間の進捗率を計算
		const totalDistance = rightPosition - leftPosition;
		const progressRatio = totalDistance > 0 ? (currentPosition - leftPosition) / totalDistance : 0;

		// 計算した進捗率を保存（ドラッグ終了時に使用）
		this.calculatedProgressValues = [];

		// すべてのスライドの進捗率を計算
		for (let i = 0; i < this.itemCount; i++) {
			let progress = 0;
			if (i === leftIndex) {
				// 左側スライド: 1.0から0.0へ
				progress = Math.max(0, 1 - progressRatio);
			} else if (i === rightIndex) {
				// 右側スライド: 0.0から1.0へ
				progress = Math.min(1, progressRatio);
			} else {
				// その他のスライド
				progress = 0;
			}
			this.calculatedProgressValues[i] = progress;
		}

		// 最も進捗率が高いスライドをアクティブとする
		const activeIndex = progressRatio < 0.5 ? leftIndex : rightIndex;
		this.calculatedActiveIndex = activeIndex;

		// シームレスモードの場合のみDOMに反映
		if (this.options.seamless) {
			this.items.forEach((item, index) => {
				item.style.setProperty("--progress", this.calculatedProgressValues[index].toFixed(3));
			});
			this.updateSlideClasses(activeIndex);
		}
	}

	// アニメーション中の進捗率更新 - 既存のメソッドを活用
	updateProgressDuringAnimation(animationProgress) {
		const fromIndex = this.getPreviousIndex();
		const toIndex = this.currentIndex;

		// すべてのスライドの進捗率をリセット
		this.items.forEach((item, index) => {
			// アニメーション開始時のアクティブスライド
			if (index === fromIndex) {
				const progressValue = Math.max(0, 1 - animationProgress).toFixed(3);
				item.style.setProperty("--progress", progressValue);
			}
			// アニメーション終了時のアクティブスライド
			else if (index === toIndex) {
				const progressValue = Math.min(1, animationProgress).toFixed(3);
				item.style.setProperty("--progress", progressValue);
			}
			// その他のスライド
			else {
				item.style.setProperty("--progress", "0");
			}
		});
	}

	// 最終的な進捗率を設定
	updateFinalProgress() {
		this.items.forEach((item, index) => {
			const progressValue = index === this.currentIndex ? "1" : "0";
			item.style.setProperty("--progress", progressValue);
		});
	}

	// 直前のアクティブインデックスを取得
	getPreviousIndex() {
		if (!this.isTransitioning) return this.currentIndex;

		// アニメーション方向から前のインデックスを推測
		if (this.animationStartPosition > this.animationEndPosition) {
			// 左/上方向への移動
			return this.currentIndex - 1;
		} else {
			// 右/下方向への移動
			return this.currentIndex + 1;
		}
	}

	// 進捗率を引き継いでスライドに移動するメソッド
	goToSlideWithProgress(index, progressValues) {
		// スライド変更前イベント発火
		const previousIndex = this.currentIndex;
		this.emit("beforeSlideChange", {
			previousIndex: previousIndex,
			currentIndex: index,
			progressValues: [...progressValues],
		});

		// 現在のインデックスを更新
		this.currentIndex = index;

		// アニメーション用の変数をスコープの外で宣言
		let currentPosition = 0;
		let translateValue = 0;

		// カルーセルの移動（スナップ位置を考慮）
		if (this.options.direction === "horizontal") {
			// スナップ位置を考慮したスライド位置を計算
			const slidePosition = this.calculateSlidePosition(index);

			// 移動量を計算
			translateValue = -slidePosition;

			// JSアニメーションを使用
			currentPosition = this.getCurrentTranslate();

			// アニメーション中も進捗率を保持するカスタムアニメーションを開始
			this.startAnimationWithProgress(currentPosition, translateValue, this.options.duration, progressValues);
		} else {
			// 垂直方向の移動
			const baseOffset = index * this.itemHeights[index];
			const gapOffset = index * this.gapSize;

			translateValue = -(baseOffset + gapOffset);

			// JSアニメーションを使用
			currentPosition = this.getCurrentTranslate();

			// アニメーション中も進捗率を保持するカスタムアニメーションを開始
			this.startAnimationWithProgress(currentPosition, translateValue, this.options.duration, progressValues);
		}

		// スライドクラスを更新
		this.updateSlideClasses();

		// ページネーションの更新
		if (this.options.pagination.enabled && this.indicators) {
			const indicators = this.indicators.querySelectorAll(".indicator");
			indicators.forEach((indicator, i) => {
				if (i === index) {
					indicator.classList.add("active");
				} else {
					indicator.classList.remove("active");
				}
			});
		}

		// アニメーション開始イベント発火
		this.emit("animationStart", {
			startPosition: currentPosition,
			targetPosition: translateValue,
			duration: this.options.duration,
		});
	}

	// 進捗率を保持するカスタムアニメーションを開始
	startAnimationWithProgress(startPosition, endPosition, duration, progressValues) {
		// 既存のアニメーションを停止
		this.stopAnimation();

		this.isTransitioning = true;
		this.animationStartTime = performance.now();
		this.animationStartPosition = startPosition;
		this.animationEndPosition = endPosition;
		this.animationDuration = duration * 1000; // 秒からミリ秒に変換

		// 開始時の進捗率を保存
		this.progressValuesStart = [...progressValues]; // 配列をコピーして保持

		// 終了時の目標進捗率を設定
		this.progressValuesEnd = Array(this.itemCount).fill(0);
		this.progressValuesEnd[this.currentIndex] = 1;

		// 非シームレスモードの場合は、アニメーション開始時に即座にクラスを更新する
		if (!this.options.seamless) {
			// 非シームレスモードではドラッグ終了時に即座にクラスを更新
			this.updateSlideClasses(this.currentIndex);
		}

		// アニメーションフレームを開始
		this.animationFrameId = requestAnimationFrame(this.updateAnimationWithProgress.bind(this));
	}

	// 進捗率を保持するアニメーションフレームの更新
	updateAnimationWithProgress(timestamp) {
		if (!this.isTransitioning) return;

		const elapsed = timestamp - this.animationStartTime;
		const progress = Math.min(elapsed / this.animationDuration, 1);

		// イージング関数を適用
		const easedProgress = this.applyEasing(progress);

		// 現在位置を計算
		const currentPosition = this.animationStartPosition + (this.animationEndPosition - this.animationStartPosition) * easedProgress;

		// 位置を設定（transform3dを使用）
		if (this.options.direction === "horizontal") {
			this.carousel.style.transform = `translate3d(${currentPosition}px, 0, 0)`;
		} else {
			this.carousel.style.transform = `translate3d(0, ${currentPosition}px, 0)`;
		}

		const fromIndex = this.getPreviousIndex();
		const toIndex = this.currentIndex;
		const calculatedProgressValues = [];

		// シームレスモードに関わらず、両方のモードで同じ進捗率計算方法を使用
		// 保存された開始値から終了値へと滑らかに変化
		for (let i = 0; i < this.itemCount; i++) {
			const startValue = this.progressValuesStart[i] || 0;
			const endValue = this.progressValuesEnd[i] || 0;
			// 開始値から終了値まで滑らかに変化
			const currentValue = startValue + (endValue - startValue) * easedProgress;
			calculatedProgressValues[i] = currentValue;
		}

		// 進捗率をDOMに反映
		this.items.forEach((item, index) => {
			item.style.setProperty("--progress", calculatedProgressValues[index].toFixed(3));
		});

		// スライドクラスの更新
		if (this.options.seamless) {
			// シームレスモードの場合は進捗率に基づいて更新
			// 最も進捗率が高いスライドをアクティブにする
			let maxProgressIndex = toIndex;
			let maxProgress = 0;

			for (let i = 0; i < this.itemCount; i++) {
				if (calculatedProgressValues[i] > maxProgress) {
					maxProgress = calculatedProgressValues[i];
					maxProgressIndex = i;
				}
			}

			this.updateSlideClasses(maxProgressIndex);
		}
		// 非シームレスモードはstartAnimationWithProgressで既に更新済み

		// 進捗率変更イベント発火
		this.emit("progressChange", {
			progress: easedProgress,
			progressValues: calculatedProgressValues,
		});

		// アニメーションが完了していない場合は次のフレームをリクエスト
		if (progress < 1) {
			this.animationFrameId = requestAnimationFrame(this.updateAnimationWithProgress.bind(this));
		} else {
			// アニメーション完了
			this.isTransitioning = false;
			this.updateCurrentOffset();

			// 最終的なスライドクラスと進捗率の更新
			this.updateSlideClasses();
			this.updateFinalProgress();

			// アニメーション完了イベント発火
			this.emit("animationEnd");

			// スライド変更後イベント発火
			this.emit("afterSlideChange", {
				currentIndex: this.currentIndex,
			});
		}
	}

	// 最後のスライドの位置を計算
	calculateLastSlidePosition() {
		let position = 0;

		// 最後のスライドまでの累積幅を計算
		for (let i = 0; i < this.itemCount - 1; i++) {
			position += this.itemWidths[i] + this.gapSize;
		}

		return position;
	}

	// イベントシステムのメソッド
	/**
	 * イベントハンドラを登録する
	 * @param {string} eventName イベント名
	 * @param {Function} callback コールバック関数
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	on(eventName, callback) {
		if (!this.events[eventName]) {
			this.events[eventName] = [];
		}
		this.events[eventName].push(callback);
		return this;
	}

	/**
	 * イベントハンドラを解除する
	 * @param {string} eventName イベント名
	 * @param {Function} [callback] 特定のコールバック関数（省略時は全て解除）
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	off(eventName, callback) {
		if (!this.events[eventName]) return this;

		if (callback) {
			// 特定のコールバックのみ解除
			this.events[eventName] = this.events[eventName].filter((cb) => cb !== callback);
		} else {
			// 全て解除
			delete this.events[eventName];
		}
		return this;
	}

	/**
	 * イベントを発火させる
	 * @param {string} eventName イベント名
	 * @param {Object} [data] イベントデータ
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	emit(eventName, data = {}) {
		const callbacks = this.events[eventName];
		if (callbacks) {
			callbacks.forEach((callback) => {
				try {
					callback(data);
				} catch (error) {
					console.error(`Error in '${eventName}' event handler:`, error);
				}
			});
		}
		return this;
	}

	// 現在のオフセット位置を更新
	updateCurrentOffset() {
		if (this.options.direction === "horizontal") {
			// スナップ位置に基づいてオフセットを計算
			const slidePosition = this.calculateSlidePosition(this.currentIndex);
			this.currentSlideOffset = -slidePosition;
		} else {
			// 垂直方向の場合
			const baseOffset = this.currentIndex * this.itemHeight;
			const gapOffset = this.currentIndex * this.gapSize;
			this.currentSlideOffset = -(baseOffset + gapOffset);
		}
	}

	/**
	 * コンテナとスライドの位置・サイズを再計算する
	 * ウィンドウリサイズやDOM変更後に呼び出すことで、カルーセルのレイアウトを更新する
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	recalculateLayout() {
		// アイテムサイズを再計算
		this.calculateItemSize();

		// 現在のスライドに再スナップ（アニメーションなし）
		const currentTranslate = this.getCurrentTranslate();
		const slidePosition = this.calculateSlidePosition(this.currentIndex);
		const targetTranslate = -slidePosition;

		// 即座に位置を更新
		if (this.options.direction === "horizontal") {
			this.carousel.style.transform = `translate3d(${targetTranslate}px, 0, 0)`;
		} else {
			this.carousel.style.transform = `translate3d(0, ${targetTranslate}px, 0)`;
		}

		// イベント発火
		this.emit("layoutRecalculated", {
			containerWidth: this.containerWidth,
			containerHeight: this.containerHeight,
			slideWidths: [...this.itemWidths],
			slideHeights: [...this.itemHeights],
		});

		return this;
	}

	/**
	 * スライドの内容が変更された場合にカルーセルを更新する
	 * 新しいスライドの追加や削除、既存スライドのコンテンツ変更後に使用
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	refresh() {
		// スライド要素を再取得
		this.items = this.carousel.querySelectorAll(".carousel-item");
		this.itemCount = this.items.length;

		// スライドのサイズ配列を再初期化
		this.itemWidths = new Array(this.itemCount).fill(0);
		this.itemHeights = new Array(this.itemCount).fill(0);

		// ページネーションを再作成
		if (this.options.pagination.enabled) {
			this.createIndicators();
		}

		// 各スライドのスタイルを再設定
		this.setupCarouselStyles();

		// レイアウトを再計算
		this.recalculateLayout();

		// カレントインデックスが範囲外になった場合は修正
		if (this.currentIndex >= this.itemCount) {
			this.currentIndex = this.itemCount - 1;
		}

		// イベント発火
		this.emit("refreshed", {
			itemCount: this.itemCount,
			currentIndex: this.currentIndex,
		});

		return this;
	}

	/**
	 * カルーセルのオプションを更新する
	 * @param {Object} newOptions 更新するオプション
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	update(newOptions = {}) {
		// 更新前のオプションを保存
		const prevOptions = { ...this.options };

		// オプションを深くマージ
		this.mergeOptions(newOptions);

		// ナビゲーションの更新
		if (newOptions.navigation) {
			if (this.options.navigation.enabled) {
				this.prevBtn = document.querySelector(this.options.navigation.prevEl);
				this.nextBtn = document.querySelector(this.options.navigation.nextEl);
			}
		}

		// ページネーションの更新
		if (newOptions.pagination) {
			if (this.options.pagination.enabled) {
				this.indicators = document.querySelector(this.options.pagination.el);
				this.createIndicators();
			}
		}

		// ギャップの更新
		if (newOptions.gap !== undefined) {
			this.gapSize = this.options.gap;
			// 各アイテムのスタイル設定（ギャップのみ動的に設定）
			this.items.forEach((item, index) => {
				if (this.options.direction === "vertical") {
					// 垂直方向の場合のギャップ
					if (this.options.gap > 0) {
						item.style.marginBottom = index < this.itemCount - 1 ? `${this.options.gap}px` : "0";
						item.style.marginRight = "0"; // 水平マージンをリセット
					}
				} else {
					// 水平方向の場合のギャップ
					if (this.options.gap > 0) {
						item.style.marginRight = index < this.itemCount - 1 ? `${this.options.gap}px` : "0";
						item.style.marginBottom = "0"; // 垂直マージンをリセット
					}
				}
			});
		}

		// 方向が変更された場合
		if (newOptions.direction && newOptions.direction !== prevOptions.direction) {
			if (this.options.direction === "vertical") {
				this.carousel.classList.add("vertical");
				this.carousel.classList.remove("horizontal");
			} else {
				this.carousel.classList.add("horizontal");
				this.carousel.classList.remove("vertical");
			}
		}

		// 自動再生の更新
		if (newOptions.autoplay !== undefined || (newOptions.loop && newOptions.loop.interval !== undefined)) {
			this.resetAutoplay();
		}

		// ドラッグ機能の更新
		if (newOptions.draggable !== undefined && newOptions.draggable !== prevOptions.draggable) {
			if (this.options.draggable) {
				this.carousel.classList.add("draggable");
				this.setupDragEvents();
			} else {
				this.carousel.classList.remove("draggable");
				// ドラッグイベントの削除（必要に応じて実装）
			}
		}

		// レイアウトを再計算
		this.recalculateLayout();

		// イベント発火
		this.emit("updated", {
			previousOptions: prevOptions,
			currentOptions: { ...this.options },
		});

		return this;
	}

	/**
	 * オプションをマージする（深い結合）
	 * @private
	 * @param {Object} newOptions 新しいオプション
	 */
	mergeOptions(newOptions) {
		for (const key in newOptions) {
			if (typeof newOptions[key] === "object" && newOptions[key] !== null && typeof this.options[key] === "object") {
				// オブジェクトの場合は再帰的にマージ
				this.mergeOptions(newOptions[key], this.options[key]);
			} else {
				// プリミティブ値の場合は上書き
				this.options[key] = newOptions[key];
			}
		}
	}

	/**
	 * カルーセルを一時的に無効化する
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	disable() {
		if (!this.isDisabled) {
			this.isDisabled = true;
			this.carousel.classList.add("carousel-disabled");

			// 自動再生を停止
			if (this.options.autoplay) {
				this.stopAutoplay();
			}

			// イベント発火
			this.emit("disabled");
		}
		return this;
	}

	/**
	 * カルーセルを有効化する
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	enable() {
		if (this.isDisabled) {
			this.isDisabled = false;
			this.carousel.classList.remove("carousel-disabled");

			// 自動再生を再開
			if (this.options.autoplay) {
				this.startAutoplay();
			}

			// イベント発火
			this.emit("enabled");
		}
		return this;
	}

	/**
	 * 新しいスライドを末尾に追加する
	 * @param {HTMLElement|string} slide 追加するスライド要素またはHTML文字列
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	appendSlide(slide) {
		const slideElement = typeof slide === "string" ? this.createSlideFromHTML(slide) : slide;

		this.carousel.appendChild(slideElement);

		// カルーセルを更新
		this.refresh();

		// イベント発火
		this.emit("slideAdded", {
			index: this.itemCount - 1,
			slide: slideElement,
		});

		return this;
	}

	/**
	 * 新しいスライドを先頭に追加する
	 * @param {HTMLElement|string} slide 追加するスライド要素またはHTML文字列
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	prependSlide(slide) {
		const slideElement = typeof slide === "string" ? this.createSlideFromHTML(slide) : slide;

		if (this.carousel.firstChild) {
			this.carousel.insertBefore(slideElement, this.carousel.firstChild);
		} else {
			this.carousel.appendChild(slideElement);
		}

		// 現在のインデックスを調整（先頭に追加するため+1）
		this.currentIndex++;

		// カルーセルを更新
		this.refresh();

		// イベント発火
		this.emit("slideAdded", {
			index: 0,
			slide: slideElement,
		});

		return this;
	}

	/**
	 * HTML文字列からスライド要素を作成する
	 * @private
	 * @param {string} html スライドのHTML文字列
	 * @returns {HTMLElement} 作成されたスライド要素
	 */
	createSlideFromHTML(html) {
		const div = document.createElement("div");
		div.innerHTML = html.trim();

		// クラスがなければ追加
		if (!div.firstChild.classList.contains("carousel-item")) {
			div.firstChild.classList.add("carousel-item");
		}

		return div.firstChild;
	}

	/**
	 * 指定インデックスのスライドを削除する
	 * @param {number} index 削除するスライドのインデックス
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	removeSlide(index) {
		if (index < 0 || index >= this.itemCount) {
			console.warn(`削除対象のスライドインデックス ${index} が範囲外です`);
			return this;
		}

		// 削除対象のスライド要素
		const slideToRemove = this.items[index];

		// 削除前にスライド要素を記録
		const removedSlide = slideToRemove.cloneNode(true);

		// スライドを削除
		slideToRemove.remove();

		// 現在のインデックスを調整
		if (index < this.currentIndex) {
			// 現在のインデックスより前のスライドを削除する場合、インデックスを減らす
			this.currentIndex--;
		} else if (index === this.currentIndex) {
			// 現在表示中のスライドを削除する場合
			if (this.currentIndex >= this.itemCount - 1) {
				// 最後のスライドだった場合、前のスライドに移動
				this.currentIndex = Math.max(0, this.itemCount - 2);
			}
			// そうでなければインデックスはそのまま（次のスライドが現在のインデックスになる）
		}

		// カルーセルを更新
		this.refresh();

		// イベント発火
		this.emit("slideRemoved", {
			index: index,
			slide: removedSlide,
		});

		return this;
	}

	/**
	 * 現在のアクティブインデックスを取得する
	 * @returns {number} 現在のアクティブインデックス
	 */
	getActiveIndex() {
		return this.currentIndex;
	}

	/**
	 * カルーセルの総スライド数を取得する
	 * @returns {number} 総スライド数
	 */
	getSlidesCount() {
		return this.itemCount;
	}

	/**
	 * カルーセルを破棄し、イベントリスナーをクリーンアップする
	 * @returns {Carousel} このインスタンス（チェーン可能）
	 */
	destroy() {
		// 自動再生を停止
		this.stopAutoplay();

		// アニメーションを停止
		this.stopAnimation();

		// ウィンドウのリサイズイベントを削除
		window.removeEventListener("resize", this.onResize);

		// タッチイベントを削除
		this.carousel.removeEventListener("touchstart", this.dragStart);
		this.carousel.removeEventListener("touchmove", this.dragMove);
		this.carousel.removeEventListener("touchend", this.dragEnd);
		this.carousel.removeEventListener("touchcancel", this.dragEnd);

		// マウスイベントを削除
		this.carousel.removeEventListener("mousedown", this.dragStart);
		window.removeEventListener("mousemove", this.boundDragMove);
		window.removeEventListener("mouseup", this.boundDragEnd);

		// ナビゲーションのイベントを削除
		if (this.options.navigation.enabled && this.prevBtn && this.nextBtn) {
			this.prevBtn.removeEventListener("click", this.onPrevClick);
			this.nextBtn.removeEventListener("click", this.onNextClick);
		}

		// マウスオーバーイベントを削除
		if (this.options.autoplay && this.options.pauseOnHover) {
			this.carousel.removeEventListener("mouseenter", this.onMouseEnter);
			this.carousel.removeEventListener("mouseleave", this.onMouseLeave);
		}

		// イベントハンドラをすべて削除
		this.events = {};

		// スタイルをリセット
		this.carousel.style.transform = "";
		this.carousel.classList.remove("horizontal", "vertical", "draggable", "carousel-disabled");

		// アイテムのスタイルをリセット
		this.items.forEach((item) => {
			item.style.marginRight = "";
			item.style.marginBottom = "";
			item.style.removeProperty("--progress");
			item.classList.remove(this.options.slideClasses.active, this.options.slideClasses.prev, this.options.slideClasses.next);
		});

		// パジネーションをクリア
		if (this.indicators) {
			this.indicators.innerHTML = "";
		}

		// イベント発火
		this.emit("destroyed");

		return this;
	}
}
