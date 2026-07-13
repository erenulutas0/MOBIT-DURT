package com.docsbot.ops.common.config;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Secure-by-default for the API documentation surface. When {@code DOCSBOT_PRODUCTION} is true and
 * the operator has NOT explicitly chosen a SpringDoc setting, the OpenAPI ({@code /v3/api-docs})
 * and Swagger UI endpoints are forced off so a production deployment never advertises its full API
 * surface by accident. An explicit {@code SPRINGDOC_ENABLED} (or a direct {@code springdoc.*}
 * property) is always honored, so it stays overridable for a deliberately documented environment.
 *
 * <p>Runs late (LOWEST_PRECEDENCE) so config-data properties are already loaded; it also reads the
 * raw {@code DOCSBOT_PRODUCTION} env var directly so it works regardless of post-processor ordering.
 */
public class SwaggerProductionDefaultsEnvironmentPostProcessor
        implements EnvironmentPostProcessor, Ordered {

    private static final Logger log =
            LoggerFactory.getLogger(SwaggerProductionDefaultsEnvironmentPostProcessor.class);

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        boolean production = Boolean.parseBoolean(environment.getProperty(
                "DOCSBOT_PRODUCTION",
                environment.getProperty("docsbot.production", "false")));
        if (!production) {
            return;
        }
        boolean explicitlyChosen = environment.containsProperty("SPRINGDOC_ENABLED")
                || environment.containsProperty("springdoc.api-docs.enabled")
                || environment.containsProperty("springdoc.swagger-ui.enabled");
        if (explicitlyChosen) {
            return;
        }
        Map<String, Object> overrides = new LinkedHashMap<>();
        overrides.put("springdoc.api-docs.enabled", false);
        overrides.put("springdoc.swagger-ui.enabled", false);
        environment.getPropertySources().addFirst(
                new MapPropertySource("docsbotSwaggerProductionDefaults", overrides));
        log.info("Production mode: SpringDoc/Swagger disabled by default (set SPRINGDOC_ENABLED=true to override)");
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
