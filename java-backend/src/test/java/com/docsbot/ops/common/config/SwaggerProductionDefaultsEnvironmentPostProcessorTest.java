package com.docsbot.ops.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

class SwaggerProductionDefaultsEnvironmentPostProcessorTest {

    private final SwaggerProductionDefaultsEnvironmentPostProcessor processor =
            new SwaggerProductionDefaultsEnvironmentPostProcessor();

    @Test
    void disablesSwaggerInProductionWhenNotExplicitlyChosen() {
        MockEnvironment environment = new MockEnvironment();
        environment.setProperty("DOCSBOT_PRODUCTION", "true");

        processor.postProcessEnvironment(environment, null);

        assertThat(environment.getProperty("springdoc.api-docs.enabled")).isEqualTo("false");
        assertThat(environment.getProperty("springdoc.swagger-ui.enabled")).isEqualTo("false");
    }

    @Test
    void leavesSwaggerUntouchedOutsideProduction() {
        MockEnvironment environment = new MockEnvironment();
        environment.setProperty("DOCSBOT_PRODUCTION", "false");

        processor.postProcessEnvironment(environment, null);

        // No override injected — the application.yml default (enabled) stands.
        assertThat(environment.containsProperty("springdoc.api-docs.enabled")).isFalse();
    }

    @Test
    void honorsAnExplicitSpringdocChoiceEvenInProduction() {
        MockEnvironment environment = new MockEnvironment();
        environment.setProperty("DOCSBOT_PRODUCTION", "true");
        environment.setProperty("SPRINGDOC_ENABLED", "true");

        processor.postProcessEnvironment(environment, null);

        // The operator opted in explicitly, so we must not force it off.
        assertThat(environment.getProperty("springdoc.api-docs.enabled")).isNull();
    }
}
