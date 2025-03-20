class Carousel {
	constructor(elementId, options = {}) {
		// 要素の取得
		this.carousel = document.getElementById(elementId);
		this.items = this.carousel.querySelectorAll(".carousel-item");
		this.prevBtn = document.getElementById("prevBtn");
		this.nextBtn = document.getElementById("nextBtn");
		this.indicators = document.getElementById("indicators");

		// オプション設定
		this.options = {
			autoplay: options.autoplay || false,
			interval: options.interval || 5000,
		};

		// 状態管理
		this.currentIndex = 0;
		this.itemCount = this.items.length;
		this.autoplayInterval = null;

		// 初期化
		this.init();
	}

	init() {
		// インジケーターの作成
		this.createIndicators();

		// イベントリスナーの設定
		this.prevBtn.addEventListener("click", () => this.prev());
		this.nextBtn.addEventListener("click", () => this.next());

		// 自動再生の設定
		if (this.options.autoplay) {
			this.startAutoplay();

			// マウスオーバー時に自動再生を停止
			this.carousel.addEventListener("mouseenter", () => this.stopAutoplay());
			this.carousel.addEventListener("mouseleave", () => this.startAutoplay());
		}

		// 初期表示
		this.goToSlide(0);
	}

	createIndicators() {
		for (let i = 0; i < this.itemCount; i++) {
			const indicator = document.createElement("div");
			indicator.classList.add("indicator");
			indicator.addEventListener("click", () => this.goToSlide(i));
			this.indicators.appendChild(indicator);
		}
	}

	goToSlide(index) {
		// インデックスの正規化
		if (index < 0) {
			index = this.itemCount - 1;
		} else if (index >= this.itemCount) {
			index = 0;
		}

		// 現在のインデックスを更新
		this.currentIndex = index;

		// カルーセルの移動
		this.carousel.style.transform = `translateX(-${index * 100}%)`;

		// インジケーターの更新
		const indicators = this.indicators.querySelectorAll(".indicator");
		indicators.forEach((indicator, i) => {
			if (i === index) {
				indicator.classList.add("active");
			} else {
				indicator.classList.remove("active");
			}
		});
	}

	next() {
		this.goToSlide(this.currentIndex + 1);
	}

	prev() {
		this.goToSlide(this.currentIndex - 1);
	}

	startAutoplay() {
		if (this.options.autoplay && !this.autoplayInterval) {
			this.autoplayInterval = setInterval(() => {
				this.next();
			}, this.options.interval);
		}
	}

	stopAutoplay() {
		if (this.autoplayInterval) {
			clearInterval(this.autoplayInterval);
			this.autoplayInterval = null;
		}
	}
}
