import { useEffect, useState } from 'react';
import './BannerCarousel.css';

const banners = [
  {
    eyebrow: 'Bộ sưu tập mới',
    title: 'Những món đồ làm ngày thường thú vị hơn.',
    description: 'Khám phá thiết kế được chọn lọc cho nhịp sống hiện đại.',
    action: 'Khám phá ngay',
    image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1400&q=85',
  },
  {
    eyebrow: 'Flash sale cuối tuần',
    title: 'Ưu đãi đến 40% cho phong cách mới.',
    description: 'Cơ hội làm mới tủ đồ với những lựa chọn được yêu thích nhất.',
    action: 'Xem ưu đãi',
    image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1400&q=85',
  },
  {
    eyebrow: 'Đặc quyền NovaMart',
    title: 'Miễn phí giao hàng cho đơn từ 500K.',
    description: 'Mua sắm thoải mái hơn, giao hàng tận nơi nhanh chóng.',
    action: 'Mua sắm ngay',
    image: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1400&q=85',
  },
];

function BannerCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % banners.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  const showSlide = (index) => {
    setActiveIndex((index + banners.length) % banners.length);
  };

  const activeBanner = banners[activeIndex];

  return (
    <section className="hero" aria-label="Khuyến mãi nổi bật">
      <img className="hero-image" src={activeBanner.image} alt="" />
      <div className="hero-shade" />
      <div className="hero-content">
        <p className="eyebrow">{activeBanner.eyebrow}</p>
        <h1>{activeBanner.title}</h1>
        <p className="hero-description">{activeBanner.description}</p>
        <a className="primary-button" href="#products">{activeBanner.action} <span aria-hidden="true">-&gt;</span></a>
      </div>
      <div className="carousel-controls">
        <button type="button" aria-label="Banner trước" onClick={() => showSlide(activeIndex - 1)}>&lt;</button>
        <div className="carousel-dots" aria-label="Chọn banner">
          {banners.map((banner, index) => (
            <button
              key={banner.title}
              className={index === activeIndex ? 'is-active' : ''}
              type="button"
              aria-label={`Xem banner ${index + 1}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => showSlide(index)}
            />
          ))}
        </div>
        <button type="button" aria-label="Banner tiếp theo" onClick={() => showSlide(activeIndex + 1)}>&gt;</button>
      </div>
    </section>
  );
}

export default BannerCarousel;