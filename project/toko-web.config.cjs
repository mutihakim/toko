module.exports = {
    apps: [{
        name: "toko-web",
        script: "artisan",
        args: "serve --host=0.0.0.0 --port=8015",
        interpreter: "php"
    }]
};
