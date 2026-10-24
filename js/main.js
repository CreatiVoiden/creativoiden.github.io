(function () {
  'use strict';

  window.__voidenReady = true;

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarsePointer = window.matchMedia('(pointer: coarse)');

  /* ---------------------------------------------------------
     Header, progress bar & active navigation
     --------------------------------------------------------- */

  var header = document.getElementById('siteHeader');
  var progress = document.getElementById('scrollProgress');
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  var navBackdrop = document.getElementById('navBackdrop');
  var navAnchors = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
  var sections = navAnchors
    .map(function (anchor) { return document.getElementById(anchor.getAttribute('data-nav')); })
    .filter(Boolean);

  var scrollTicking = false;

  function updateScrollUI() {
    var y = window.pageYOffset || window.scrollY || 0;
    var max = document.documentElement.scrollHeight - window.innerHeight;

    if (header) {
      header.classList.toggle('is-scrolled', y > 24);
    }

    if (progress) {
      var ratio = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      progress.style.width = (ratio * 100).toFixed(2) + '%';
    }

    var active = navAnchors.length ? navAnchors[0].getAttribute('data-nav') : '';
    sections.forEach(function (section) {
      if (y >= section.offsetTop - 140) {
        active = section.id;
      }
    });

    navAnchors.forEach(function (anchor) {
      var isActive = anchor.getAttribute('data-nav') === active;
      anchor.classList.toggle('is-active', isActive);
      if (isActive) {
        anchor.setAttribute('aria-current', 'location');
      } else {
        anchor.removeAttribute('aria-current');
      }
    });

    scrollTicking = false;
  }

  function requestScrollUpdate() {
    if (!scrollTicking) {
      scrollTicking = true;
      window.requestAnimationFrame(updateScrollUI);
    }
  }

  window.addEventListener('scroll', requestScrollUpdate, { passive: true });
  window.addEventListener('resize', requestScrollUpdate);
  updateScrollUI();

  /* ---------------------------------------------------------
     Mobile navigation
     --------------------------------------------------------- */

  function setNav(open) {
    if (!navToggle || !navLinks) {
      return;
    }

    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
    navLinks.classList.toggle('is-open', open);
    if (navBackdrop) {
      navBackdrop.classList.toggle('is-open', open);
    }
    if (header) {
      header.classList.toggle('is-open', open);
    }
    document.body.classList.toggle('nav-open', open);
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      setNav(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setNav(false);
      });
    });

    if (navBackdrop) {
      navBackdrop.addEventListener('click', function () {
        setNav(false);
      });
    }

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
        setNav(false);
        navToggle.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 960) {
        setNav(false);
      }
    });
  }

  /* ---------------------------------------------------------
     Reveal on scroll
     --------------------------------------------------------- */

  var revealItems = Array.prototype.slice.call(document.querySelectorAll('.reveal'));

  if (!('IntersectionObserver' in window) || reduceMotion.matches) {
    revealItems.forEach(function (item) {
      item.classList.add('is-visible');
    });
  } else {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  }

  reduceMotion.addEventListener?.('change', function (event) {
    if (event.matches) {
      revealItems.forEach(function (item) {
        item.classList.add('is-visible');
      });
    }
  });

  /* ---------------------------------------------------------
     Star field (hero only)
     --------------------------------------------------------- */

  var canvas = document.getElementById('starfield');
  var hero = document.querySelector('.hero');

  if (canvas && hero && canvas.getContext) {
    var context = canvas.getContext('2d');
    var stars = [];
    var width = 0;
    var height = 0;
    var dpr = 1;
    var frameId = 0;
    var pointerX = 0;
    var pointerY = 0;
    var targetX = 0;
    var targetY = 0;

    function makeStars() {
      var count = Math.round((width * height) / 16000);
      count = Math.max(36, Math.min(110, count));
      stars = [];

      for (var i = 0; i < count; i += 1) {
        var cool = Math.random() > 0.82;
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: Math.random() * 1.35 + 0.35,
          alpha: Math.random() * 0.48 + 0.16,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.7 + 0.25,
          depth: Math.random() * 0.8 + 0.2,
          drift: Math.random() * 0.05 + 0.012,
          fill: cool ? 'rgb(126, 224, 255)' : 'rgb(214, 229, 255)'
        });
      }
    }

    function drawStars(time) {
      if (!width || !height) {
        return;
      }

      context.clearRect(0, 0, width, height);

      var offsetX = pointerX * 12;
      var offsetY = pointerY * 8;

      for (var i = 0; i < stars.length; i += 1) {
        var star = stars[i];
        var twinkle = 0.62 + 0.38 * Math.sin(time * 0.001 * star.speed + star.phase);

        context.globalAlpha = Math.max(0.05, star.alpha * twinkle);
        context.fillStyle = star.fill;
        context.beginPath();
        context.arc(
          star.x + offsetX * star.depth,
          star.y + offsetY * star.depth,
          star.radius,
          0,
          Math.PI * 2
        );
        context.fill();
      }

      context.globalAlpha = 1;
    }

    function resizeStars() {
      var rect = hero.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      makeStars();
      drawStars(0);
    }

    function animateStars(time) {
      pointerX += (targetX - pointerX) * 0.04;
      pointerY += (targetY - pointerY) * 0.04;

      for (var i = 0; i < stars.length; i += 1) {
        stars[i].y -= stars[i].drift;
        if (stars[i].y < -4) {
          stars[i].y = height + 4;
          stars[i].x = Math.random() * width;
        }
      }

      drawStars(time);
      frameId = window.requestAnimationFrame(animateStars);
    }

    function startStars() {
      if (!frameId && !reduceMotion.matches) {
        frameId = window.requestAnimationFrame(animateStars);
      }
    }

    function stopStars() {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        frameId = 0;
      }
    }

    resizeStars();

    if (reduceMotion.matches) {
      drawStars(0);
    } else {
      startStars();
    }

    hero.addEventListener('pointermove', function (event) {
      if (coarsePointer.matches || reduceMotion.matches) {
        return;
      }
      var rect = hero.getBoundingClientRect();
      targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    });

    hero.addEventListener('pointerleave', function () {
      targetX = 0;
      targetY = 0;
    });

    var heroObserver = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting && !document.hidden) {
        startStars();
      } else {
        stopStars();
      }
    }, { threshold: 0.02 });

    heroObserver.observe(hero);

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopStars();
      } else {
        startStars();
      }
    });

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        resizeStars();
        if (reduceMotion.matches) {
          drawStars(0);
        }
      }, 180);
    });

    reduceMotion.addEventListener?.('change', function (event) {
      if (event.matches) {
        stopStars();
        drawStars(0);
      } else {
        startStars();
      }
    });
  }

  /* ---------------------------------------------------------
     Pointer tilt on the hero orb
     --------------------------------------------------------- */

  var tiltArea = document.querySelector('[data-tilt-area]');
  var tiltTarget = document.querySelector('[data-tilt]');

  if (tiltArea && tiltTarget && !coarsePointer.matches && !reduceMotion.matches) {
    tiltArea.addEventListener('pointermove', function (event) {
      var rect = tiltArea.getBoundingClientRect();
      var x = (event.clientX - rect.left) / rect.width - 0.5;
      var y = (event.clientY - rect.top) / rect.height - 0.5;

      tiltTarget.style.transform =
        'rotateX(' + (-y * 7).toFixed(2) + 'deg) rotateY(' + (x * 9).toFixed(2) + 'deg)';
    });

    tiltArea.addEventListener('pointerleave', function () {
      tiltTarget.style.transform = '';
    });
  }

  /* ---------------------------------------------------------
     Feedback form
     --------------------------------------------------------- */

  var form = document.getElementById('feedbackForm');
  var toast = document.getElementById('toast');
  var toastTimer = 0;

  function showToast(message) {
    if (!toast) {
      return;
    }

    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 6500);
  }

  if (form) {
    var nameField = form.querySelector('#name');
    var emailField = form.querySelector('#email');
    var messageField = form.querySelector('#message');

    var fields = [
      {
        input: nameField,
        error: document.getElementById('nameError'),
        validate: function (value) {
          return value.trim() ? '' : '请填写你的称呼。';
        }
      },
      {
        input: emailField,
        error: document.getElementById('emailError'),
        validate: function (value) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? '' : '请填写有效的邮箱地址。';
        }
      },
      {
        input: messageField,
        error: document.getElementById('messageError'),
        validate: function (value) {
          return value.trim().length >= 2 ? '' : '请填写反馈内容。';
        }
      }
    ].filter(function (field) {
      return field.input && field.error;
    });

    function validateField(field) {
      var message = field.validate(field.input.value);
      field.error.textContent = message;
      field.input.setAttribute('aria-invalid', message ? 'true' : 'false');
      field.input.closest('.field').classList.toggle('is-invalid', Boolean(message));
      return !message;
    }

    fields.forEach(function (field) {
      field.input.addEventListener('blur', function () {
        if (field.input.value.trim()) {
          validateField(field);
        }
      });

      field.input.addEventListener('input', function () {
        if (field.input.getAttribute('aria-invalid') === 'true') {
          validateField(field);
        }
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var valid = true;
      var firstInvalid = null;

      fields.forEach(function (field) {
        var fieldValid = validateField(field);
        if (!fieldValid && !firstInvalid) {
          firstInvalid = field.input;
        }
        valid = valid && fieldValid;
      });

      if (!valid) {
        if (firstInvalid) {
          firstInvalid.focus();
        }
        return;
      }

      var name = nameField.value.trim();
      var email = emailField.value.trim();
      var message = messageField.value.trim();
      var subject = '网站反馈 · ' + name;
      var body = '称呼：' + name + '\n邮箱：' + email + '\n\n' + message;

      window.location.href =
        'mailto:Steve-Voiden@Outlook.com?subject=' +
        encodeURIComponent(subject) +
        '&body=' +
        encodeURIComponent(body);

      showToast('已打开邮件客户端。若没有反应，请直接发送至 Steve-Voiden@Outlook.com。');
    });
  }
})();
