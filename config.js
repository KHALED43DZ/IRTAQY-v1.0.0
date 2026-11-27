/* إرتقِ | IRTAQY — إعدادات التطبيق */
window.IRTAQY_CONFIG = {
  VERSION: "1.0.0",
  ID_PREFIX: "irtaqy-",
  MAX_STUDENTS: 8,           // الحد الأقصى للتلاميذ في الحصة الواحدة (نسخة التجربة)
  QUALITY: {                 // جودة فيديو الأستاذ
    low: { width: 320, height: 240, frameRate: 12 },
    mid: { width: 640, height: 480, frameRate: 15 }
  },
  // خوادم STUN/TURN. خوادم TURN العامة المجانية قد تكون بطيئة أو محدودة،
  // ويمكنك استبدالها بحساب مجاني من metered.ca أو Cloudflare لاحقاً.
  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
    { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turns:openrelay.metered.ca:443?transport=tcp"],
      username: "openrelayproject", credential: "openrelayproject" }
  ]
};
