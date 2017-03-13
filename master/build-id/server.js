var Handlebars = require('handlebars'),
    handlebarsHelpers = (require('./server/handlebarsHelpers'))(Handlebars),
    connect = require('connect'),
    https = require('https'),
    http = require('http'),
    url = require('url'),
    redirect = require('connect-redirection'),
    fs = require('fs'),
    _ = require('underscore'),
    deepExtend = require('deep-extend');

var staticDir = '../master/static',
    stubsDir = '../master',
    isConfigurator = false,
    configuratorMainFile = "",
    configuratorSuffix = "",
    isOwnerServices = false,
    isCatalogue = false,
    isUniversal = false,
    characterSet = process.argv.slice(2)[0],
    htmlDirection = process.argv.slice(2)[1],
    portNumber = process.argv.slice(2)[2],
    locale = process.argv.slice(2)[3],
    currency = process.argv.slice(2)[4],
    secure = process.argv.slice(2)[5],
    portNumberSpec = Number(portNumber) + 100,
    isRightToLeft = htmlDirection === 'rtl' ? true : false,
    isMediumTitle = false,
    isSmallTitle = false;

/** Test Server **/
var testDir = '..',
    test = connect().use(connect.static(testDir))
    .use(function(req, res, next) {
        var url = req.url.replace(/^\/aem-id-parent\/master\/static/, ''),
            urlParts = url.split("/"),
            redirectContentTypes = ["common-assets", "components", "pages", "partials", "static-templates"];
        if (redirectContentTypes.indexOf(urlParts[1]) !== -1){
            res.writeHead(301,
               { "Location": "/master/static" + url }
            );
            res.end();
        }
        next();
    })
    .listen(portNumberSpec);

/** Localhost with stubs **/

var local = connect();

local.use(connect.static(staticDir))
    .use(redirect())
    .use(function(req, res, next) {

        //get URL parts
        var urlParts = req.originalUrl.split('/'),
            route = urlParts[1],
			subroute = urlParts[2],
            pipe = {},
            component_partials = false;


        // Delete Require Cache
        var deleteRequireCache = function (path){
            if (fs.existsSync(path)) {
                require.cache[require.resolve(path)] = null;
            }
        };

        var getAllComponents = function () {
            return component_partials;
        };

        var setAllComponents = function () {
            var partialsDir = staticDir + '/components',
                dirnames = fs.readdirSync(partialsDir),
                partials = {};

            if (component_partials === false) {
                dirnames.forEach(function (dirname) {
                    if (dirname !== '_template_' && dirname.indexOf('.') === -1) {
                        var template = getComponent('components', dirname);
                        partials[dirname] = template;
                    }
                });
                component_partials = partials;
            }


            return component_partials;
        };


        // Get Component
        var getComponent = function(contentType, _componentName){
            // urlParts[3] will be content, when that happens the require bellow will fail,
            // as there is no path with that. this fixes this but its a hack
            if (!_componentName && urlParts[3] === 'content') {
                return '';
            }

            // Init vars
            var brand = urlParts[2],
                componentName = _componentName || urlParts[3],
                componentWrapper,
                iframesrc = null,
                output;

            // Define File Paths
            var componentTemplateFile = staticDir + '/' + contentType + '/' + componentName + '/html/' + componentName + '.hbs',
                componentContentFile = staticDir + '/' + contentType + '/' + componentName + '/content/content.json';

            // Delete cache
            deleteRequireCache(componentTemplateFile);
            deleteRequireCache(componentContentFile);

            // Grab Fresh TPL + Content
            var componentTemplate = require(componentTemplateFile);
            var componentContent = require(componentContentFile);

            // Refresh Description and Brand Content
            var componentConfig = componentContent.config,
                brandedContent = componentContent[brand];

            if (componentContent.hasOwnProperty('allbrands')) {
                brandedContent = deepExtend({}, componentContent['allbrands'], brandedContent);
            }

            // Test Config
            if (componentConfig) {

                var nestedComponents = componentConfig.nestedComponents,
                    nestedPartials = componentConfig.nestedPartials;

                // register nested components
                if (nestedComponents) {
                    if (nestedComponents.length > 0) {
                        for (var comp in nestedComponents) {

                            var tplFile = staticDir + '/components/' + nestedComponents[comp] + '/html/' + nestedComponents[comp] + '.hbs';
                            deleteRequireCache(tplFile);
                            Handlebars.registerPartial(nestedComponents[comp], require(tplFile));

                            var contentFile = require(staticDir + '/components/' + nestedComponents[comp] + '/content/content.json');

                            if (contentFile.hasOwnProperty('allbrands')) {
                                brandedContent = deepExtend({}, brandedContent, contentFile['allbrands']);
                            }
                            brandedContent = deepExtend({}, brandedContent, contentFile[brand]);

                        }
                    }
                }

                // register nested partials
                if (nestedPartials) {
                    if (nestedPartials.length > 0) {
                        for (var part in nestedPartials) {

                            var tplFile = staticDir + '/components/' + componentName + '/html/' + nestedPartials[part] + '.hbs';
                            deleteRequireCache(tplFile);
                            Handlebars.registerPartial(nestedPartials[part], require(tplFile));

                        }
                    }
                }

                isCatalogue = componentConfig.catalogue;
                isUniversal = componentConfig.universal;
                isConfigurator = componentConfig.configurator;
                configuratorMainFile = componentConfig.configuratorMainFile;
                isOwnerServices = componentConfig.ownerServices;
                isMediumTitle = componentConfig.mediumTitle;
                isSmallTitle = componentConfig.smallTitle;

            }


            // If calling an individual component compiled HTML TPL
            if(_componentName){

                output = componentTemplate({
                    content: brandedContent,
                    subcomponent: getAllComponents()
                });

                // If calling component content display iFrame page.
            } else {

                // Use iFrame versus static-component template
                if ( urlParts.length === 5 && urlParts[4] === 'preview' ){
                    componentWrapper = require(staticDir + '/static-templates/iframe-content.hbs');
                    iframesrc = '/' + urlParts[1] + '/' + urlParts[2]+ '/' + urlParts[3];
                } else if( urlParts.length === 5 && urlParts[4] === 'grid' ) {
                    componentWrapper = require(staticDir + '/static-templates/static-component-grid.hbs');
                } else {
                    componentWrapper = require(staticDir + '/static-templates/static-component.hbs');
                }

                // Compile tpl with content
                output = componentWrapper({
                    "component": componentTemplate,
                    "componentName": componentName,
                    "componentConfig": componentConfig,
                    "content": brandedContent,
                    "brand": brand,
                    "iframesrc": iframesrc,
                    "subcomponent": getAllComponents(),
                    "isCatalogue": isCatalogue,
                    "isUniversal": isUniversal,
                    "isConfigurator": isConfigurator,
                    "configuratorMainFile": configuratorMainFile,
                    "isRightToLeft": isRightToLeft,
                    "isOwnerServices": isOwnerServices,
                    "characterSet": characterSet,
                    "locale": locale,
                    "currency": currency,
                    "isMediumTitle": isMediumTitle,
                    "isSmallTitle": isSmallTitle
                });
            }

            // Return output
            return output;

        };


        // Get compile HTML for partial
        var getPartial = function(contentType, _partialName){

            // Init vars
            var output,
                brand = urlParts[2],
                partial = require(staticDir + '/' + contentType + '/' + _partialName + '.hbs');

            // Compile TPL
            output = partial({
                "brand": brand,
                "isConfigurator": isConfigurator,
                "configuratorMainFile": configuratorMainFile,
                "configuratorSuffix": configuratorSuffix,
                "isCatalogue": isCatalogue,
                "isRightToLeft": isRightToLeft,
                "isOwnerServices": isOwnerServices,
                "characterSet": characterSet,
                "locale": locale,
                "currency": currency,
                "isMediumTitle": isMediumTitle,
                "isSmallTitle": isSmallTitle
            });

            // Return output
            return output;
        };

        // Redirect JSON stubs that are using path suffixes to original file
        if (route === 'common-assets' && subroute === 'json') {
            // Configurator calls to `/configurator-{brand}.mtc.json/{suffix_category}` will be redirected back to `/configurator-{brand}.mtc.json`
            // Component C_142A-3 calls to eq `/c_142A-3_response.json/service/{service_no}/dealerId/{dealer_id}/date/{date_val}/data.json` will be redirected back to `/c_142A-3_response.json`
            // Find a dealer - getDealers - calls to `/getDealers.json/{sufix}/{sufix}/{sufix}/{...}` will be redirected back to the original .json file.
            // Find a dealer - getDealerResultsBasic -  calls to `/getDealerResultsBasic.json/{sufix}/{sufix}/{sufix}/{...}` will be redirected back to the original .json file.
            // Find a dealer - getDealerResults -  calls to `/getDealerResults.json/{sufix}/{sufix}/{sufix}/{...}` will be redirected back to the original .json file.
            if (req.originalUrl.match(/(configurator-\w*.mtc.json)/i)) {
                return res.redirect(301, req.originalUrl.replace(/\/[^//]+$/i, ""));
            } else if (req.originalUrl.match(/(c_142A-3_response\.json.*\.json)/i)) {
                return res.redirect(301, req.originalUrl.replace(/\..*$/i, ".json"));
            } else if (req.originalUrl.match(/getDealers\.json.*\.json/i)) {
                return res.redirect(301, req.originalUrl.replace(/\..*$/i, ".json"));
            } else if (req.originalUrl.match(/getDealerResultsBasic\.json.*\.json/i)) {
                return res.redirect(301, req.originalUrl.replace(/\..*$/i, ".json"));
            } else if (req.originalUrl.match(/getDealerResults\.json.*\.json/i)) {
                return res.redirect(301, req.originalUrl.replace(/\..*$/i, ".json"));
            } else {
                next();
            }
        }

        // Redirect JSON component stub that are using path suffixes to original content file
        // Redirect c_099-4 component filter stub json suffix to the original content file `data-filters.json`
        if (route === 'components' && subroute === 'c_099-4') {
            // C_099-4 after using the filter will call `.../data-filters.json/{filter_1}/{filterVal_1}/{filter_2}/{filterVal_2}...`
            // this will be redirected back to the original `.../data-filters.json` path
            if (req.originalUrl.match(/(data-filters\.json)/i)) {
                return res.redirect(301, req.originalUrl.split('data-filters.json')[0] + 'data-filters.json');
            } else {
                next();
            }
        }

        // Get single component
        pipe.component = function(contentType){
            res.end(getComponent(contentType));
        };


        // Get single page, e.g. /pages/nissan/homepage/preview
        pipe.page = function(contentType){

            // Grab URL parts + config
            var brand = urlParts[2],
                pageName = urlParts[3],
                processedConfig;

            // Define File Paths
            var pageTemplateFile = staticDir + '/' + contentType + '/' + pageName + '/html/' + pageName + '.hbs',
                configFile = staticDir + '/' + contentType + '/' + pageName + '/config.json';

            // Delete cache
            deleteRequireCache(pageTemplateFile);
            deleteRequireCache(configFile);

            // Grab Fresh TPL + Config
            var pageTemplate = require(pageTemplateFile);
            var config = require(configFile);

            // Init Vars
            var components = {};
            var partials = {};

            isCatalogue = config.catalogue;
            isUniversal = config.universal;
            isConfigurator = config.configurator;
            configuratorSuffix = config.configuratorSuffix;
            isOwnerServices = config.ownerServices;
            isMediumTitle = config.mediumTitle;
            isSmallTitle = config.smallTitle;

            // Loop through `components` in CONFIG
            config.components.forEach(function(component, index){
                /*
                 @todo might want to consider using INDEX to allow multi-option-config for the same component.
                 */
                components[component] = getComponent('components', component);
            });

            // Loop through `partials` in CONFIG
            config.partials.forEach(function(partial){
                partials[partial] = getPartial('partials', partial);
            });

            // Clone Config + Add in components and partials
            processedConfig = _.clone(config);
            processedConfig.components = components;
            processedConfig.partials = partials;
            processedConfig.brand = brand;
            processedConfig.isConfigurator = isConfigurator;
            processedConfig.isCatalogue = isCatalogue;
            processedConfig.isRightToLeft = isRightToLeft;
            processedConfig.isOwnerServices = isOwnerServices;
            processedConfig.configuratorSuffix = configuratorSuffix;
            processedConfig.isMediumTitle = isMediumTitle;
            processedConfig.isSmallTitle = isSmallTitle;

            // Serve Result.
            res.end(pageTemplate(processedConfig));

        };


        // Build component index page
        pipe.items = function(contentType){

            // Grab TPL
            var pageWrapper = require(staticDir + '/static-templates/static-items-list.hbs'),
                componentNames = require(staticDir + '/static-templates/component-names.json'),
                itemIndex = fs.readdirSync(staticDir + '/' +  contentType + '/'),
                itemList = [],
                components = false,
                thisComponentName;

            if (contentType === 'components') {
                components = true;
            }

            // Build list of TPLs
            for(var i = 0; i < itemIndex.length; i++){
                if(itemIndex[i] !== '_template_' && itemIndex[i] !== '.DS_Store'){

                    var path,
                        osConfig,
                        os = false;

                    if (contentType === 'components') {
                        path = staticDir + '/' +  contentType + '/' + itemIndex[i] +'/content/content.json';
                        osConfig = require(path);

                        if (osConfig.config && osConfig['config'].hasOwnProperty('ownerServices') && osConfig.config.ownerServices) {
                            os = true;
                        }
                    }

                    //attempt to find name
                    thisComponentName = componentNames[itemIndex[i]] || '';

                    //always add component
                    itemList.push ({
                        code : itemIndex[i],
                        label : itemIndex[i] + ' ' + thisComponentName,
                        os: os
                    });
                }
            }

            // Return compiled TPL
            res.end(pageWrapper({
                type: contentType,
                item: itemList,
                components: components,
                portNumberSpec: portNumberSpec
            }));

        };


        // Get individual styleguide page
        pipe.styleguide = function(contentType){

            // Grab brand from URL
            var brand = urlParts[2];

            // Define File Paths
            var styleguideTemplateFile = staticDir + '/' + contentType + '/' + brand + '/html/styleguide.hbs',
                styleguideWrapperFile = staticDir + '/static-templates/styleguide.hbs';

            // Delete cache
            deleteRequireCache(styleguideTemplateFile);
            deleteRequireCache(styleguideWrapperFile);

            // Grab Fresh TPL + Content
            var styleguideTemplate = require(styleguideTemplateFile);
            var styleguideWrapper = require(styleguideWrapperFile);

            // Return output
            res.end(styleguideTemplate());

        };


        // Get styleguides homepage
        pipe.styleguides = function(contentType){

            // Fetch Template etc
            var pageWrapper = require(staticDir + '/static-templates/styleguide.hbs'),
                styleguideIndex = fs.readdirSync(staticDir + '/' +  contentType + '/'),
                styleguideList = [];

            // Loops through styleguides dir and make list
            for(var i = 0; i < styleguideIndex.length; i++){
                styleguideList.push (staticDir + '/' + contentType + '/' + styleguideIndex[i] + '/html/' + styleguideIndex[i] + '.hbs');
            }

            // Return compiled template
            res.end(pageWrapper({
                type: contentType,
                styleguide: styleguideIndex,
                portNumberSpec: portNumberSpec
            }));

        };

        // Get individual offline page
        pipe.offlineOne = function(contentType){

            // Grab brand from URL
            var brand = urlParts[2];

            // Grab brand from URL
            var fileName = urlParts[3] || 'index';

            // Define File Paths
            var offlineTemplateFile = staticDir + '/' + contentType + '/' + brand + '/html/' + fileName + '.hbs';

            // Delete cache
            deleteRequireCache(offlineTemplateFile);

            // Grab Fresh TPL + Content
            var offlineTemplate = require(offlineTemplateFile);

            // Return output
            res.end(offlineTemplate({
                commonAssets: '/common-assets',
                minify: '',
                brandFolder: brand + '/',
                imgAssets: '/common-assets/img/' + brand,
                offlineCommonAssets: '/offline/' + brand + '/common-assets',
            }));
        };

        // Get offline homepage
        pipe.offlineList = function(contentType){

            // Fetch Template etc
            var pageWrapper = require(staticDir + '/static-templates/offline.hbs'),
                offlineIndex = fs.readdirSync(staticDir + '/' +  contentType + '/'),
                offlineList = [],
                blackList = ['common-assets', 'shared'];

            // Loops through offline dir and make list
            for (var i = 0, len = offlineIndex.length; i < len; i++) {
                if(blackList.indexOf(offlineIndex[i]) === -1) {
                    offlineList.push (offlineIndex[i]);
                }
            }

            // Return compiled template
            res.end(pageWrapper({
                type: contentType,
                offline: offlineList,
                portNumberSpec: portNumberSpec
            }));

        };

        // Get stub
        pipe.stub = function() {
            var stubPath = url.parse(req.url).pathname,
                stubFile = stubsDir + stubPath + '.js',
                stubModule,
                fileExists = false;

            if (fs.existsSync(stubFile)) {
                fileExists = true;
            } else {
                while (stubPath.lastIndexOf('/')) {
                    stubPath = stubPath.substring(0, stubPath.lastIndexOf('/'));
                    stubFile = stubsDir + stubPath + '.js';
                    if (fs.existsSync(stubFile)) {
                        fileExists = true;
                        break;
                    }
                }
            }

            if (fileExists) {
                deleteRequireCache(stubFile);
                stubModule = require(stubFile);
                if (stubModule.hasOwnProperty('run')) {
                    stubModule.run(req, res);
                } else {
                    res.statusCode = 500;
                    console.error('Stub file "' + stubFile + '" does not have "run" method defined.');
                }
            } else {
                res.statusCode = 404;
                console.error('Stub file does not exist: ' + stubFile);
            }
        };


        /**
         *  BUILD OUTPUT
         */

        // Init vars
        var contentType = null;

        // Component
        if(route === 'components'){

            setAllComponents();

            contentType = route;

            if(urlParts.length > 3){
                pipe.component( contentType );
            } else {
                pipe.items(contentType);
            }


        // Styleguides
        } else if (route === 'styleguides'){

            contentType = route;

            if(urlParts.length > 3){
                pipe.styleguide(contentType);
            } else {
                pipe.styleguides(contentType);
            }


        // Pages
        } else if(route === 'pages'){

            setAllComponents();

            contentType = route;

            if(urlParts.length > 3){
                pipe.page(contentType);
            } else {
                pipe.items(contentType);
            }


        // Offline
        } else if(route === 'offline'){

            contentType = route;

            if (urlParts.length > 3) {
                pipe.offlineOne(contentType);
            } else {
                pipe.offlineList(contentType);
            }

        // Default
        } else if(route === 'stubs') {
            pipe.stub();
        }
        else {
            if(req.originalUrl === '/'){
                res.redirect('/components');
            } else {
                next();
            }
        }

    });

if (secure === 'yes' || secure === 'both') {
    https.createServer({
        key: fs.readFileSync('./ssl/server.key'),
        cert: fs.readFileSync('./ssl/server.crt'),
        ca: fs.readFileSync('./ssl/ca.crt'),
        requestCert: true,
        rejectUnauthorized: false
    },local).listen(Number(portNumber) + 1);

    if (secure === 'both') {
        http.createServer(local).listen(portNumber);
    }
} else {
    http.createServer(local).listen(portNumber);
}
