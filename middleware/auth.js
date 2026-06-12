function requireLogin(req, res, next) {
    if (req.session?.user) return next();

    if (req.originalUrl.startsWith('/api/')) {
        return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
    }

    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session?.user) return requireLogin(req, res, next);
        if (roles.includes(req.session.user.role)) return next();

        if (req.originalUrl.startsWith('/api/')) {
            return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác này' });
        }

        return res.status(403).render('forbidden', {
            user: req.session.user
        });
    };
}

module.exports = {
    requireLogin,
    requireRole
};
